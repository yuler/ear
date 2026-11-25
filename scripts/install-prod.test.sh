#!/usr/bin/env bash
set -euo pipefail

# Regression test:
# - On Linux: install-prod.sh must preserve legacy $XDG_DATA_HOME/ear/library
#   and prod user data, clear stale NSH OTA updates, and install the packaged
#   dev.yuler.ear.png icon while removing the stale scalable ear.svg.
# - On macOS: install-prod.sh must install Ear.app with distinct GUI and CLI
#   binaries, symlink ~/.local/bin/ear to Contents/Helpers/ear, and clear
#   stale NSH OTA updates while preserving user library data.

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
  mkdir -p "$MOCK_XDG/ear/library" \
    "$MOCK_XDG/dev.yuler.ear/library" \
    "$MOCK_XDG/dev.yuler.ear/updates/packages" \
    "$MOCK_XDG/icons/hicolor/scalable/apps" \
    "$MOCK_STAGE/Ear"
  SENTINEL="$MOCK_XDG/ear/library/sentinel.json"
  PROD_ENTRY="$MOCK_XDG/dev.yuler.ear/library/prod-123.json"
  PROD_STORAGE="$MOCK_XDG/dev.yuler.ear/storage.json"
  STALE_OTA="$MOCK_XDG/dev.yuler.ear/updates/current.nshpkg"
  STALE_SVG="$MOCK_XDG/icons/hicolor/scalable/apps/ear.svg"
  echo '{"videoId":"legacy-123"}' > "$SENTINEL"
  echo '{"videoId":"prod-123"}' > "$PROD_ENTRY"
  echo '{"theme":"dark"}' > "$PROD_STORAGE"
  echo 'stale-ota-pkg' > "$STALE_OTA"
  echo '<svg>old</svg>' > "$STALE_SVG"
  printf '\x89PNG\r\n\x1a\nfake-icon' > "$MOCK_STAGE/Ear/dev.yuler.ear.png"

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
  mkdir -p "$MOCK_STAGE/Ear.app/Contents/MacOS" \
    "$MOCK_STAGE/Ear.app/Contents/Helpers" \
    "$MOCK_HOME/Library/Application Support/dev.yuler.ear/library" \
    "$MOCK_HOME/Library/Application Support/dev.yuler.ear/updates"
  PROD_ENTRY="$MOCK_HOME/Library/Application Support/dev.yuler.ear/library/prod-123.json"
  STALE_OTA="$MOCK_HOME/Library/Application Support/dev.yuler.ear/updates/current.nshpkg"
  echo '{"videoId":"prod-123"}' > "$PROD_ENTRY"
  echo 'stale-ota-pkg' > "$STALE_OTA"
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
  test -f "$PROD_ENTRY"
  test -f "$PROD_STORAGE"
  test ! -e "$MOCK_XDG/dev.yuler.ear/updates"
  test -x "$MOCK_XDG/ear-app/Ear"
  test -L "$MOCK_HOME/.local/bin/ear"
  test -x "$MOCK_HOME/.local/bin/Ear"
  test -f "$MOCK_XDG/icons/hicolor/512x512/apps/dev.yuler.ear.png"
  test ! -e "$STALE_SVG"
  grep -qx "Icon=${MOCK_HOME}/.local/share/ear-app/dev.yuler.ear.png" "$MOCK_XDG/applications/dev.yuler.ear.desktop"

  # 2. Reinstall (must preserve user data and clear newly created stale OTA updates)
  mkdir -p "$MOCK_XDG/dev.yuler.ear/updates"
  echo 'stale-ota-2' > "$STALE_OTA"
  run_install
  test -f "$SENTINEL"
  grep -q "legacy-123" "$SENTINEL"
  test -f "$PROD_ENTRY"
  test -f "$PROD_STORAGE"
  test ! -e "$MOCK_XDG/dev.yuler.ear/updates"
  test -x "$MOCK_XDG/ear-app/Ear"

  echo "PASS: install-prod.test.sh preserved user data, cleared stale OTA updates, and installed packaged PNG icon"
else
  run_install
  APP_DST="$MOCK_HOME/Applications/Ear.app"
  test -x "$APP_DST/Contents/MacOS/Ear"
  test -x "$APP_DST/Contents/Helpers/ear"
  test -L "$MOCK_HOME/.local/bin/ear"
  test "$(readlink "$MOCK_HOME/.local/bin/ear")" = "$APP_DST/Contents/Helpers/ear"
  test "$("$APP_DST/Contents/MacOS/Ear")" = "Ear GUI"
  test "$("$MOCK_HOME/.local/bin/ear" --version)" = "ear 0.0.99 (schema v1)"
  test -f "$PROD_ENTRY"
  test ! -e "$MOCK_HOME/Library/Application Support/dev.yuler.ear/updates"

  # Reinstall keeps symlink, preserves library, and clears stale OTA updates
  mkdir -p "$MOCK_HOME/Library/Application Support/dev.yuler.ear/updates"
  echo 'stale-ota-2' > "$STALE_OTA"
  run_install
  test "$(readlink "$MOCK_HOME/.local/bin/ear")" = "$APP_DST/Contents/Helpers/ear"
  test "$("$APP_DST/Contents/MacOS/Ear")" = "Ear GUI"
  test -f "$PROD_ENTRY"
  test ! -e "$MOCK_HOME/Library/Application Support/dev.yuler.ear/updates"

  echo "PASS: install-prod.test.sh installed Ear.app, symlinked CLI, and cleared stale OTA updates"
fi
