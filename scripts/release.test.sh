#!/usr/bin/env bash
# Hermetic release-policy regressions: no signing keys, builds or GitHub writes.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/repo"
cd "$tmp/repo"
git init -q
git config user.name Cozilla
git config user.email cozilla41@gmail.com
mkdir -p app/ui cli/src
printf 'old' > app/icon.png
printf '{}' > app/nsh.json
printf 'old' > cli/src/main.rs
printf 'old' > mise.toml
printf 'old' > app/ui/View.tsx
git add .
git commit -qm initial
base=$(git rev-parse HEAD)
count=0
expect_mode() {
  local expected=$1 from=$2 force=${3:-false} actual
  actual=$(bash "$root/scripts/release-mode.sh" "$from" HEAD "$force")
  [ "$actual" = "$expected" ] || { echo "Expected $expected, got $actual" >&2; exit 1; }
  count=$((count + 1))
}
expect_mode full ''
expect_mode ota "$base"
expect_mode full "$base" true
printf 'UI' >> app/ui/View.tsx
git add . && git commit -qm UI
expect_mode ota "$base"
for path in app/icon.png app/nsh.json cli/src/main.rs mise.toml scripts/linux-launcher.sh .github/workflows/release.yml; do
  before=$(git rev-parse HEAD)
  mkdir -p "$(dirname "$path")"
  printf 'native change' >> "$path"
  git add . && git commit -qm native
  expect_mode full "$before"
done
# A subsequent UI commit must not hide an unreleased shell change.
printf 'more UI' >> app/ui/View.tsx
git add . && git commit -qm UI
expect_mode full "$base"
# Detect removed/renamed native inputs, too.
before=$(git rev-parse HEAD)
git mv app/icon.png app/renamed.png
git commit -qm rename
expect_mode full "$before"
if bash "$root/scripts/release-mode.sh" missing-ref HEAD false >/dev/null 2>&1; then exit 1; fi
if bash "$root/scripts/release-mode.sh" "$base" HEAD invalid >/dev/null 2>&1; then exit 1; fi

mkdir -p "$tmp/bin" "$tmp/fixture/app" "$tmp/fixture/dist" "$tmp/fixture/keys"
cat > "$tmp/bin/nsh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$NSH_CALLS"
case "$1" in
  publish)
    while [ "$1" != '-o' ]; do shift; done
    touch "$2"
    ;;
  update-manifest)
    package=false
    for arg in "$@"; do
      if [ "$arg" = --package ]; then package=true; fi
    done
    if [ "$package" = true ] || [ "${BAD_MANIFEST:-false}" = true ]; then
      printf '{"package":{"url":"test.nshpkg"}}' > dist/latest.json
    else
      printf '{"platforms":{}}' > dist/latest.json
    fi
    ;;
  *) exit 1 ;;
esac
MOCK
chmod +x "$tmp/bin/nsh"
export PATH="$tmp/bin:$PATH" NSH_CALLS="$tmp/calls"
cd "$tmp/fixture"
printf '{"updater":{}}' > app/nsh.json
touch keys/release.secret keys/release.cert keys/update.secret
touch dist/Ear-1.0.0-linux-x86_64.tar.gz dist/Ear-1.0.0-macos-aarch64.zip dist/release_notes.md
# OTA with signing material must publish and include the package.
bash "$root/scripts/release-manifest.sh" ota 42
jq -e '.package != null' dist/latest.json >/dev/null
[[ "$(<"$NSH_CALLS")" == *'publish --key'* ]]
[[ "$(<"$NSH_CALLS")" == *'--package dist/dev.yuler.ear-42.nshpkg'* ]]
[[ "$(<"$NSH_CALLS")" == *'--key keys/update.secret'* ]]
# Even a stale signed package must not leak into a full-update manifest.
: > "$NSH_CALLS"
bash "$root/scripts/release-manifest.sh" full 42
jq -e 'has("package") | not' dist/latest.json >/dev/null
[[ "$(<"$NSH_CALLS")" != *'publish --key'* ]]
[[ "$(<"$NSH_CALLS")" != *'--package'* ]]
[[ "$(<"$NSH_CALLS")" == *'--key keys/update.secret'* ]]
# Missing release keys retain the existing full-app fallback (no stale package).
rm keys/release.secret
: > "$NSH_CALLS"
bash "$root/scripts/release-manifest.sh" ota 42
jq -e 'has("package") | not' dist/latest.json >/dev/null
[[ "$(<"$NSH_CALLS")" != *'--package'* ]]
# Missing update key retains the unsigned fallback, with no updater declaration.
rm keys/update.secret
bash "$root/scripts/release-manifest.sh" full 42
jq -e 'has("updater") | not' app/nsh.json >/dev/null
# An unexpected package emitted by the tool must block a full release.
if BAD_MANIFEST=true bash "$root/scripts/release-manifest.sh" full 42 >/dev/null 2>&1; then exit 1; fi
if bash "$root/scripts/release-manifest.sh" invalid 42 >/dev/null 2>&1; then exit 1; fi
printf 'Release policy regressions passed (%s mode cases; signed OTA, full, stale artifact, missing keys, fail-closed manifest).\n' "$count"
