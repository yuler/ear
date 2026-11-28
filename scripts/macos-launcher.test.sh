#!/usr/bin/env bash
# The Mac app entry must put Contents/Helpers ahead of PATH before the GUI starts,
# so a double-clicked Ear.app can spawn the bare command "ear".
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHER="$REPO_ROOT/scripts/macos-launcher.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

grep -q 'macos-launcher.sh' "$REPO_ROOT/.github/workflows/release.yml"

MACOS="$TMP/Ear.app/Contents/MacOS"
HELPERS="$TMP/Ear.app/Contents/Helpers"
mkdir -p "$MACOS" "$HELPERS"
cp "$LAUNCHER" "$MACOS/Ear"
chmod +x "$MACOS/Ear"

cat > "$MACOS/Ear.bin" << 'EOF'
#!/bin/sh
printf '%s\n' "$PATH"
command -v ear
EOF
cat > "$HELPERS/ear" << 'EOF'
#!/bin/sh
echo bundled
EOF
chmod +x "$MACOS/Ear.bin" "$HELPERS/ear"

PATH="/usr/bin:/bin:/usr/sbin:/sbin" output="$("$MACOS/Ear")"
first="${output%%$'\n'*}"
resolved="${output#*$'\n'}"

case "$first" in
  "$HELPERS":*) ;;
  *) echo "PATH does not start with the bundled helper dir: $first" >&2; exit 1 ;;
esac
test "$resolved" = "$HELPERS/ear"

echo "PASS: macos launcher puts Contents/Helpers/ear first on PATH"
