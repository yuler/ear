#!/usr/bin/env bash
set -euo pipefail

mise install

if command -v cargo >/dev/null 2>&1; then
  echo "Building Ear CLI (release)…"
  mise run cli:build
fi

# Doctor treats playback codecs as optional, so its exit status only covers
# required startup dependencies. Probe the same media elements independently.
linux_codecs_available() {
  if [[ "$(uname -s)" != Linux ]]; then return 0; fi
  local element
  for element in qtdemux avdec_h264 avdec_aac; do
    if ! gst-inspect-1.0 "$element" >/dev/null 2>&1; then return 1; fi
  done
}

# Check runtime dependencies via ear doctor if available
if command -v ear >/dev/null 2>&1; then
  if ! ear doctor >/dev/null 2>&1 || ! linux_codecs_available; then
    echo "Installing missing Linux runtime dependencies (WebKitGTK 6 & GStreamer plugins)…"
    if command -v pacman >/dev/null 2>&1; then
      echo "Installing packages via pacman…"
      if command -v sudo >/dev/null 2>&1; then
        sudo pacman -S --needed --noconfirm webkitgtk-6.0 gst-plugins-good gst-libav gst-plugins-ugly gst-plugins-bad
      else
        pkexec pacman -S --needed --noconfirm webkitgtk-6.0 gst-plugins-good gst-libav gst-plugins-ugly gst-plugins-bad
      fi
    elif command -v apt-get >/dev/null 2>&1; then
      echo "Installing packages via apt-get…"
      if command -v sudo >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y libwebkitgtk-6.0-4 gstreamer1.0-plugins-good gstreamer1.0-libav gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly
      else
        pkexec apt-get update && pkexec apt-get install -y libwebkitgtk-6.0-4 gstreamer1.0-plugins-good gstreamer1.0-libav gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly
      fi
    elif command -v dnf >/dev/null 2>&1; then
      echo "Installing packages via dnf…"
      if command -v sudo >/dev/null 2>&1; then
        sudo dnf install -y webkitgtk6.0 gstreamer1-plugins-good gstreamer1-plugin-libav gstreamer1-plugins-bad-free gstreamer1-plugins-ugly-free
      else
        pkexec dnf install -y webkitgtk6.0 gstreamer1-plugins-good gstreamer1-plugin-libav gstreamer1-plugins-bad-free gstreamer1-plugins-ugly-free
      fi
    elif command -v zypper >/dev/null 2>&1; then
      echo "Installing packages via zypper…"
      if command -v sudo >/dev/null 2>&1; then
        sudo zypper install -y libwebkitgtk-6_0-4 gstreamer-plugins-good gstreamer-plugins-libav gstreamer-plugins-bad gstreamer-plugins-ugly
      else
        pkexec zypper install -y libwebkitgtk-6_0-4 gstreamer-plugins-good gstreamer-plugins-libav gstreamer-plugins-bad gstreamer-plugins-ugly
      fi
    elif command -v apk >/dev/null 2>&1; then
      echo "Installing packages via apk…"
      if command -v sudo >/dev/null 2>&1; then
        sudo apk add webkit2gtk-6.0 gst-plugins-good gst-libav gst-plugins-bad gst-plugins-ugly
      else
        pkexec apk add webkit2gtk-6.0 gst-plugins-good gst-libav gst-plugins-bad gst-plugins-ugly
      fi
    else
      echo "Could not auto-detect package manager." >&2
      ear doctor || true
      exit 1
    fi
  fi
  ear doctor
  if ! linux_codecs_available; then
    echo "Playback codecs are still missing; inspect ear doctor output and install the required GStreamer plugins." >&2
    exit 1
  fi
fi
