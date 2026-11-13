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
  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR" "${HOME}/.local/bin" "${HOME}/.local/share/applications" "${HOME}/.local/share/icons/hicolor/scalable/apps"
  cp -a "$TMP_DIR/extracted/Ear/." "$INSTALL_DIR/"
  chmod +x "$INSTALL_DIR/Ear" "$INSTALL_DIR/Ear.bin" "$INSTALL_DIR/ear"

  ln -sf "$INSTALL_DIR/ear" "${HOME}/.local/bin/ear"
  cat > "${HOME}/.local/bin/Ear" << EOF
#!/usr/bin/env bash
exec "${INSTALL_DIR}/Ear" "\$@"
EOF
  chmod +x "${HOME}/.local/bin/Ear"

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ICON_SRC="${SCRIPT_DIR}/../www/public/favicon.svg"
  if [[ -f "$ICON_SRC" ]]; then
    cp "$ICON_SRC" "${HOME}/.local/share/icons/hicolor/scalable/apps/ear.svg"
  fi

  cat > "${HOME}/.local/share/applications/dev.yuler.ear.desktop" << EOF
[Desktop Entry]
Type=Application
Name=Ear
Comment=Comprehensible-input listening desktop app
Exec=${INSTALL_DIR}/Ear
Icon=ear
StartupWMClass=dev.yuler.ear
Terminal=false
Categories=Utility;AudioVideo;Education;
EOF

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
  rm -rf "$APP_DST"
  cp -a "$APP_SRC" "$APP_DST"

  if [[ -x "${APP_DST}/Contents/MacOS/ear" ]]; then
    ln -sf "${APP_DST}/Contents/MacOS/ear" "${HOME}/.local/bin/ear"
  fi

  echo "Installed Ear ${TAG} to ${APP_DST}"
else
  echo "Unsupported platform for install-prod.sh: ${OS}/${ARCH}." >&2
  echo "Download the appropriate archive from https://github.com/${REPO}/releases/tag/${TAG}" >&2
  exit 1
fi
