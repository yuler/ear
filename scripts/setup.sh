#!/usr/bin/env bash
set -euo pipefail

mise install

if command -v cargo >/dev/null 2>&1; then
  echo "Building Ear CLI (release)…"
  mise run cli:build
fi

# Check runtime dependencies via ear doctor if available
if command -v ear >/dev/null 2>&1; then
  if ! ear doctor --preflight >/dev/null 2>&1; then
    echo "Checking missing runtime dependencies…"
    if command -v pacman >/dev/null 2>&1; then
      echo "Installing webkitgtk-6.0 via pacman (required by nsh Linux host)…"
      if command -v sudo >/dev/null 2>&1; then
        sudo pacman -S --needed --noconfirm webkitgtk-6.0
      else
        pkexec pacman -S --needed --noconfirm webkitgtk-6.0
      fi
    elif command -v apt-get >/dev/null 2>&1; then
      echo "Installing libwebkitgtk-6.0-4 via apt-get (required by nsh Linux host)…"
      if command -v sudo >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y libwebkitgtk-6.0-4
      else
        pkexec apt-get update && pkexec apt-get install -y libwebkitgtk-6.0-4
      fi
    elif command -v dnf >/dev/null 2>&1; then
      echo "Installing webkitgtk6.0 via dnf (required by nsh Linux host)…"
      if command -v sudo >/dev/null 2>&1; then
        sudo dnf install -y webkitgtk6.0
      else
        pkexec dnf install -y webkitgtk6.0
      fi
    elif command -v zypper >/dev/null 2>&1; then
      echo "Installing libwebkitgtk-6_0-4 via zypper (required by nsh Linux host)…"
      if command -v sudo >/dev/null 2>&1; then
        sudo zypper install -y libwebkitgtk-6_0-4
      else
        pkexec zypper install -y libwebkitgtk-6_0-4
      fi
    elif command -v apk >/dev/null 2>&1; then
      echo "Installing webkit2gtk-6.0 via apk (required by nsh Linux host)…"
      if command -v sudo >/dev/null 2>&1; then
        sudo apk add webkit2gtk-6.0
      else
        pkexec apk add webkit2gtk-6.0
      fi
    else
      echo "Could not auto-detect package manager." >&2
      ear doctor || exit 1
    fi
  else
    ear doctor
  fi
fi
