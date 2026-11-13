#!/usr/bin/env bash
set -euo pipefail

# Regression test:
# - On Linux: install-prod.sh must preserve legacy $XDG_DATA_HOME/ear/library
#   across both initial installation and reinstallation.
# - On macOS: install-prod.sh must install Ear.app with distinct GUI and CLI
#   binaries and symlink ~/.local/bin/ear to Contents/Helpers/ear.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

MOCK_HOME="$TMP_ROOT/home"
MOCK_XDG="$MOCK_HOME/.local/share"
MOCK_BIN="$TMP_ROOT/bin"
MOCK_STAGE="$TMP_ROOT/stage"
ARCHIVE_DIR="$TMP_ROOT/assets"
mkdir -p "$MOCK_HOME" "$MOCK_BIN" "$ARCHIVE_DIR"

OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "$OS" == "Linux" && "$ARCH" == "x86_64" ]]; then
  mkdir -p "$MOCK_XDG/ear/library" "$MOCK_STAGE/Ear"
  SENTINEL="$MOCK_XDG/ear/library/sentinel.json"
  echo '{"videoId":"legacy-123"}' > "$SENTINEL"

  cat > "$MOCK_STAGE/Ear/Ear" << 'EOF'
#!/usr/bin/env bash
echo "Ear launcher"
EOF
  cat > "$MOCK_STAGE/Ear/Ear.bin" << 'EOF'
#!/usr/bin/env bash
echo "Ear.bin"
EOF
  cat > "$MOCK_STAGE/Ear/ear" << 'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "doctor" ]]; then
  echo "ear doctor ok"
  exit 0
fi
EOF
  chmod +x "$MOCK_STAGE/Ear/Ear" "$MOCK_STAGE/Ear/Ear.bin" "$MOCK_STAGE/Ear/ear"

  tar -czf "$ARCHIVE_DIR/Ear-0.0.99-linux-x86_64.tar.gz" -C "$MOCK_STAGE" Ear
  (cd "$ARCHIVE_DIR" && sha256sum Ear-0.0.99-linux-x86_64.tar.gz > checksums.txt)
elif [[ "$OS" == "Darwin" && "$ARCH" == "arm64" ]]; then
  mkdir -p "$MOCK_STAGE/Ear.app/Contents/MacOS" "$MOCK_STAGE/Ear.app/Contents/Helpers"
  cat > "$MOCK_STAGE/Ear.app/Contents/MacOS/Ear" << 'EOF'
#!/usr/bin/env bash
echo "Ear GUI"
EOF
  cat > "$MOCK_STAGE/Ear.app/Contents/Helpers/ear" << 'EOF'
#!/usr/bin/env bash
echo "ear 0.0.99 (schema v1)"
EOF
  chmod +x "$MOCK_STAGE/Ear.app/Contents/MacOS/Ear" "$MOCK_STAGE/Ear.app/Contents/Helpers/ear"

  ditto -c -k --keepParent "$MOCK_STAGE/Ear.app" "$ARCHIVE_DIR/Ear-0.0.99-macos-aarch64.zip"
  (cd "$ARCHIVE_DIR" && shasum -a 256 Ear-0.0.99-macos-aarch64.zip > checksums.txt)
else
  echo "SKIP: install-prod.test.sh does not support ${OS}/${ARCH}"
  exit 0
fi

# Mock gh CLI in PATH
cat > "$MOCK_BIN/gh" << EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "release" && "\${2:-}" == "view" ]]; then
  echo "v0.0.99"
  exit 0
fi
if [[ "\${1:-}" == "release" && "\${2:-}" == "download" ]]; then
  pattern=""
  dir=""
  while [[ \$# -gt 0 ]]; do
    case "\$1" in
      --pattern) pattern="\$2"; shift 2 ;;
      --dir) dir="\$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  cp "$ARCHIVE_DIR/\$pattern" "\$dir/\$pattern"
  exit 0
fi
exit 1
EOF
chmod +x "$MOCK_BIN/gh"

run_install() {
  HOME="$MOCK_HOME" \
  XDG_DATA_HOME="$MOCK_XDG" \
  PATH="$MOCK_BIN:$PATH" \
  bash "$REPO_ROOT/scripts/install-prod.sh" >/dev/null
}

if [[ "$OS" == "Linux" ]]; then
  # 1. Initial install
  run_install
  test -f "$SENTINEL"
  grep -q "legacy-123" "$SENTINEL"
  test -x "$MOCK_XDG/ear-app/Ear"
  test -L "$MOCK_HOME/.local/bin/ear"
  test -x "$MOCK_HOME/.local/bin/Ear"

  # 2. Reinstall (must still preserve legacy sentinel library)
  run_install
  test -f "$SENTINEL"
  grep -q "legacy-123" "$SENTINEL"
  test -x "$MOCK_XDG/ear-app/Ear"

  echo "PASS: install-prod.test.sh preserved legacy library across install and reinstall"
else
  run_install
  APP_DST="$MOCK_HOME/Applications/Ear.app"
  test -x "$APP_DST/Contents/MacOS/Ear"
  test -x "$APP_DST/Contents/Helpers/ear"
  test -L "$MOCK_HOME/.local/bin/ear"
  test "$(readlink "$MOCK_HOME/.local/bin/ear")" = "$APP_DST/Contents/Helpers/ear"
  test "$("$APP_DST/Contents/MacOS/Ear")" = "Ear GUI"
  test "$("$MOCK_HOME/.local/bin/ear" --version)" = "ear 0.0.99 (schema v1)"

  # Reinstall keeps symlink and distinct binaries intact
  run_install
  test "$(readlink "$MOCK_HOME/.local/bin/ear")" = "$APP_DST/Contents/Helpers/ear"
  test "$("$APP_DST/Contents/MacOS/Ear")" = "Ear GUI"

  echo "PASS: install-prod.test.sh installed Ear.app and symlinked ~/.local/bin/ear to Contents/Helpers/ear"
fi
