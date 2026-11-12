#!/usr/bin/env bash
set -euo pipefail

mise install

if command -v cargo >/dev/null 2>&1; then
  echo "Building Ear CLI (release)…"
  mise run cli:build
fi

# nsh Linux host needs WebKitGTK 6 for web views (see https://nsh.dev/docs/linux).
if [[ ! -e /usr/lib/libwebkitgtk-6.0.so.4 ]]; then
  if command -v pacman >/dev/null 2>&1; then
    echo "Installing webkitgtk-6.0 (required by nsh Linux host)…"
    if command -v sudo >/dev/null 2>&1; then
      sudo pacman -S --needed --noconfirm webkitgtk-6.0
    else
      pkexec pacman -S --needed --noconfirm webkitgtk-6.0
    fi
  else
    echo "Missing libwebkitgtk-6.0.so.4. Install WebKitGTK 6.0 for your distro, e.g.:" >&2
    echo "  Debian/Ubuntu: sudo apt install libwebkitgtk-6.0-4" >&2
    echo "  Fedora:        sudo dnf install webkitgtk6.0" >&2
    exit 1
  fi
fi
