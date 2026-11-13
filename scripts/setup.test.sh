#!/usr/bin/env bash
# Hermetic setup regressions: no real builds, privilege escalation or package installs.
set -euo pipefail
setup="$(cd "$(dirname "$0")" && pwd)/setup.sh"
bash_bin="$(command -v bash)"
ln_bin="$(command -v ln)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/mock" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "${0##*/}" in
  mise|cargo) exit 0 ;;
  uname) echo "${TEST_OS:-Linux}" ;;
  ear)
    echo 'ear doctor' >> "$TEST_LOG"
    # A healthy WebKitGTK desktop still returns zero with missing optional codecs.
    exit "${DOCTOR_STATUS:-0}"
    ;;
  gst-inspect-1.0)
    echo "probe $1" >> "$TEST_LOG"
    [[ "${MISSING_CODEC:-}" != "$1" || -f "$TEST_STATE" ]]
    ;;
  sudo|pkexec) exec "$@" ;;
  pacman|apt-get|dnf|zypper|apk)
    echo "install ${0##*/} $*" >> "$TEST_LOG"
    [[ "${INSTALL_FAIL:-0}" == 0 ]] || exit 42
    if [[ "${INSTALL_REPAIRS:-1}" == 1 ]]; then
      : > "$TEST_STATE"
      # Only the package that actually supplies the probe may create it.
      case " $* " in
        *" $PROBE_PACKAGE "*)
          if [[ ! -e "$TEST_BIN/gst-inspect-1.0" ]]; then
            ln -s "$MOCK_COMMAND" "$TEST_BIN/gst-inspect-1.0"
          fi
          ;;
      esac
    fi
    ;;
esac
MOCK
chmod +x "$tmp/mock"

run_case() {
  local name="$1" manager="$2" privilege="$3" missing="$4" doctor="$5" fail="$6" repairs="$7" os="$8" want="$9" expect_install="${10}"
  local dir="$tmp/$name" status=0 probe_package absent="${11:-0}"
  case "$manager" in
    pacman) probe_package=gstreamer ;;
    apt-get) probe_package=gstreamer1.0-tools ;;
    dnf) probe_package=gstreamer1 ;;
    zypper) probe_package=gstreamer-utils ;;
    apk) probe_package=gstreamer-tools ;;
    *) probe_package=none ;;
  esac
  mkdir -p "$dir/bin"
  ln -s "$bash_bin" "$dir/bin/bash"
  ln -s "$ln_bin" "$dir/bin/ln"
  if [[ "$absent" == 0 ]]; then ln -s "$tmp/mock" "$dir/bin/gst-inspect-1.0"; fi
  for command in mise cargo uname ear; do
    ln -s "$tmp/mock" "$dir/bin/$command"
  done
  if [[ "$manager" != none ]]; then ln -s "$tmp/mock" "$dir/bin/$manager"; fi
  ln -s "$tmp/mock" "$dir/bin/$privilege"
  : > "$dir/log"
  PATH="$dir/bin" TEST_LOG="$dir/log" TEST_STATE="$dir/repaired" \
    PROBE_PACKAGE="$probe_package" TEST_BIN="$dir/bin" MOCK_COMMAND="$tmp/mock" \
    MISSING_CODEC="$missing" DOCTOR_STATUS="$doctor" INSTALL_FAIL="$fail" \
    INSTALL_REPAIRS="$repairs" TEST_OS="$os" \
    "$bash_bin" "$setup" > "$dir/output" 2>&1 || status=$?
  if [[ "$want" == success ]]; then
    [[ "$status" == 0 ]] || { cat "$dir/output"; echo "FAIL: $name ($status)"; exit 1; }
  else
    [[ "$status" != 0 ]] || { cat "$dir/output"; echo "FAIL: $name unexpectedly succeeded"; exit 1; }
  fi
  if [[ "$expect_install" == yes ]]; then
    grep -q '^install ' "$dir/log" || { echo "FAIL: $name skipped installation"; exit 1; }
  else
    if grep -q '^install ' "$dir/log"; then echo "FAIL: $name installed unnecessarily"; exit 1; fi
  fi
  echo "PASS: $name"
}

for manager in pacman apt-get dnf zypper apk; do
  for privilege in sudo pkexec; do
    run_case "missing-codecs-$manager-$privilege" "$manager" "$privilege" avdec_h264 0 0 1 Linux success yes
    run_case "install-failure-$manager-$privilege" "$manager" "$privilege" avdec_h264 0 1 1 Linux failure yes
    run_case "missing-probe-$manager-$privilege" "$manager" "$privilege" '' 0 0 1 Linux success yes 1
  done
done
for codec in qtdemux avdec_aac; do
  run_case "missing-$codec" pacman sudo "$codec" 0 0 1 Linux success yes
done
run_case healthy pacman sudo '' 0 0 1 Linux success no
run_case still-missing-after-install pacman sudo avdec_h264 0 0 0 Linux failure yes
run_case unsupported-manager none sudo avdec_h264 0 0 1 Linux failure no
run_case required-dependency-failure pacman sudo '' 1 0 1 Linux failure yes
run_case macos-no-linux-codecs pacman sudo avdec_h264 0 0 1 Darwin success no
