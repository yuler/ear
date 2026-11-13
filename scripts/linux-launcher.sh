#!/usr/bin/env bash
set -e

# Resolve directory of this launcher script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_BIN="$DIR/Ear.bin"

# If Ear.bin doesn't exist, check fallback locations
if [[ ! -f "$TARGET_BIN" ]]; then
  if [[ -f "$DIR/Ear-bin" ]]; then
    TARGET_BIN="$DIR/Ear-bin"
  elif [[ -f "$DIR/nsh/Ear.bin" ]]; then
    TARGET_BIN="$DIR/nsh/Ear.bin"
  else
    echo "Error: Application binary not found at $TARGET_BIN" >&2
    exit 1
  fi
fi

# Run preflight check via the bundled ear CLI if available
PREFLIGHT_OUTPUT=""
PREFLIGHT_STATUS=0

if [[ -x "$DIR/ear" ]]; then
  # Capture output while allowing stderr
  PREFLIGHT_OUTPUT=$("$DIR/ear" doctor --preflight 2>&1) || PREFLIGHT_STATUS=$?
else
  # Minimal fallback check if ear CLI binary is missing
  if ! ldconfig -p 2>/dev/null | grep -q "libwebkitgtk-6.0.so.4" && \
     [[ ! -f /usr/lib/libwebkitgtk-6.0.so.4 ]] && \
     [[ ! -f /usr/lib64/libwebkitgtk-6.0.so.4 ]] && \
     [[ ! -f /usr/lib/x86_64-linux-gnu/libwebkitgtk-6.0.so.4 ]] && \
     [[ ! -f /usr/local/lib/libwebkitgtk-6.0.so.4 ]]; then
    PREFLIGHT_STATUS=1
    PREFLIGHT_OUTPUT="Error: Missing required runtime dependency 'WebKitGTK 6.0' (libwebkitgtk-6.0.so.4).
Please install WebKitGTK 6.0 for your distribution:
  • Arch / Omarchy:  sudo pacman -S webkitgtk-6.0
  • Ubuntu / Debian: sudo apt install libwebkitgtk-6.0-4
  • Fedora:          sudo dnf install webkitgtk6.0
  • openSUSE:        sudo zypper install libwebkitgtk-6_0-4"
  fi
fi

if [[ "$PREFLIGHT_STATUS" -eq 0 ]]; then
  exec "$TARGET_BIN" "$@"
fi

# Preflight failed: print to stderr for terminal users
echo "$PREFLIGHT_OUTPUT" >&2

# If launched from GUI desktop (e.g. file manager or application menu without terminal),
# show a graphical alert box so user is not left with a silent crash.
if [[ -n "${DISPLAY:-}" || -n "${WAYLAND_DISPLAY:-}" ]]; then
  CLEAN_MSG=$(echo "$PREFLIGHT_OUTPUT" | sed 's/^[[:space:]]*//')
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --title="Ear — Missing Dependency" --no-wrap --text="$CLEAN_MSG" 2>/dev/null || true
  elif command -v kdialog >/dev/null 2>&1; then
    kdialog --title "Ear — Missing Dependency" --error "$CLEAN_MSG" 2>/dev/null || true
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send -u critical "Ear — Missing Dependency" "$CLEAN_MSG" 2>/dev/null || true
  elif command -v xmessage >/dev/null 2>&1; then
    xmessage -center "$CLEAN_MSG" 2>/dev/null || true
  fi
fi

exit "$PREFLIGHT_STATUS"
