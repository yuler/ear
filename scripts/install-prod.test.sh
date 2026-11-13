#!/usr/bin/env bash
set -euo pipefail

# Regression test: install-prod.sh must preserve legacy $XDG_DATA_HOME/ear/library
# across both initial installation and reinstallation.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

MOCK_HOME="$TMP_ROOT/home"
MOCK_XDG="$MOCK_HOME/.local/share"
MOCK_BIN="$TMP_ROOT/bin"
MOCK_STAGE="$TMP_ROOT/stage"
mkdir -p "$MOCK_HOME" "$MOCK_XDG/ear/library" "$MOCK_BIN" "$MOCK_STAGE/Ear"

# Sentinel legacy library file that must survive install + reinstall
SENTINEL="$MOCK_XDG/ear/library/sentinel.json"
echo '{"videoId":"legacy-123"}' > "$SENTINEL"

# Build fake release archive Ear-0.0.99-linux-x86_64.tar.gz + checksums.txt
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

ARCHIVE_DIR="$TMP_ROOT/assets"
mkdir -p "$ARCHIVE_DIR"
tar -czf "$ARCHIVE_DIR/Ear-0.0.99-linux-x86_64.tar.gz" -C "$MOCK_STAGE" Ear
(cd "$ARCHIVE_DIR" && sha256sum Ear-0.0.99-linux-x86_64.tar.gz > checksums.txt)

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
