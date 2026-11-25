#!/usr/bin/env bash
set -euo pipefail

REPO="${EAR_GITHUB_REPO:-yuler/ear}"
TAG="${1:-${EAR_VERSION:-}}"

if [[ -z "$TAG" ]]; then
  if command -v gh >/dev/null 2>&1; then
    TAG="$(gh release view --repo "$REPO" --json tagName --jq '.tagName')"
  else
    TAG="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)"
  fi
fi

if [[ -z "$TAG" ]]; then
  echo "Error: Could not resolve latest release tag for ${REPO}." >&2
  exit 1
fi

VERSION="${TAG#v}"
OS="$(uname -s)"
ARCH="$(uname -m)"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

download_asset() {
  local asset="$1"
  if command -v gh >/dev/null 2>&1; then
    gh release download "$TAG" --repo "$REPO" --pattern "$asset" --dir "$TMP_DIR" --clobber
  else
    curl -fsSL "https://github.com/${REPO}/releases/download/${TAG}/${asset}" -o "${TMP_DIR}/${asset}"
  fi
}

echo "Installing Ear ${TAG} (${OS}/${ARCH})…"

if [[ "$OS" == "Linux" && "$ARCH" == "x86_64" ]]; then
  ASSET="Ear-${VERSION}-linux-x86_64.tar.gz"
  download_asset "$ASSET"
  download_asset "checksums.txt"

  (cd "$TMP_DIR" && sha256sum -c <(grep "$ASSET" checksums.txt))

  mkdir -p "$TMP_DIR/extracted"
  tar -xzf "${TMP_DIR}/${ASSET}" -C "$TMP_DIR/extracted"

  INSTALL_DIR="${HOME}/.local/share/ear-app"
  DATA_DIR="${XDG_DATA_HOME:-${HOME}/.local/share}/dev.yuler.ear"
  rm -rf "$INSTALL_DIR" "${DATA_DIR}/updates"
  mkdir -p "$INSTALL_DIR" "${HOME}/.local/bin" "${HOME}/.local/share/applications"
  cp -a "$TMP_DIR/extracted/Ear/." "$INSTALL_DIR/"
  chmod +x "$INSTALL_DIR/Ear" "$INSTALL_DIR/Ear.bin" "$INSTALL_DIR/ear"

  ln -sf "$INSTALL_DIR/ear" "${HOME}/.local/bin/ear"
  cat > "${HOME}/.local/bin/Ear" << EOF
#!/usr/bin/env bash
exec "${INSTALL_DIR}/Ear" "\$@"
EOF
  chmod +x "${HOME}/.local/bin/Ear"

  ICON_PATH="${INSTALL_DIR}/dev.yuler.ear.png"
  ICON_VALUE="ear"
  if [[ -f "$ICON_PATH" ]]; then
    mkdir -p "${HOME}/.local/share/icons/hicolor/512x512/apps"
    cp "$ICON_PATH" "${HOME}/.local/share/icons/hicolor/512x512/apps/dev.yuler.ear.png"
    rm -f "${HOME}/.local/share/icons/hicolor/scalable/apps/ear.svg"
    ICON_VALUE="$ICON_PATH"
  else
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    ICON_SRC="${SCRIPT_DIR}/../web/public/favicon.svg"
    if [[ -f "$ICON_SRC" ]]; then
      mkdir -p "${HOME}/.local/share/icons/hicolor/scalable/apps"
      cp "$ICON_SRC" "${HOME}/.local/share/icons/hicolor/scalable/apps/ear.svg"
    fi
  fi

  cat > "${HOME}/.local/share/applications/dev.yuler.ear.desktop" << EOF
[Desktop Entry]
Type=Application
Name=Ear
Comment=Comprehensible-input listening desktop app
Exec=${INSTALL_DIR}/Ear
Icon=${ICON_VALUE}
StartupWMClass=dev.yuler.ear
Terminal=false
Categories=Utility;AudioVideo;Education;
EOF

  if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "${HOME}/.local/share/icons/hicolor" >/dev/null 2>&1 || true
  fi
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${HOME}/.local/share/applications" || true
  fi

  echo "Installed Ear ${TAG} to ${INSTALL_DIR}"
  "${HOME}/.local/bin/ear" doctor
elif [[ "$OS" == "Darwin" && "$ARCH" == "arm64" ]]; then
  ASSET="Ear-${VERSION}-macos-aarch64.zip"
  download_asset "$ASSET"
  download_asset "checksums.txt"

  (cd "$TMP_DIR" && shasum -a 256 -c <(grep "$ASSET" checksums.txt))

  mkdir -p "$TMP_DIR/extracted" "${HOME}/Applications" "${HOME}/.local/bin"
  unzip -q "${TMP_DIR}/${ASSET}" -d "$TMP_DIR/extracted"

  APP_SRC="$TMP_DIR/extracted/Ear.app"
  APP_DST="${HOME}/Applications/Ear.app"
  DATA_DIR="${HOME}/Library/Application Support/dev.yuler.ear"
  rm -rf "$APP_DST" "${DATA_DIR}/updates"
  cp -a "$APP_SRC" "$APP_DST"

  if [[ -x "${APP_DST}/Contents/Helpers/ear" ]]; then
    ln -sf "${APP_DST}/Contents/Helpers/ear" "${HOME}/.local/bin/ear"
  fi

  echo "Installed Ear ${TAG} to ${APP_DST}"
else
  echo "Unsupported platform for install-prod.sh: ${OS}/${ARCH}." >&2
  echo "Download the appropriate archive from https://github.com/${REPO}/releases/tag/${TAG}" >&2
  exit 1
fi
