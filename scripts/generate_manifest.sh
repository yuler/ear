#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd))"

# Default version from VERSION file
DEFAULT_VERSION="0.0.1"
if [ -f "$ROOT_DIR/VERSION" ]; then
  DEFAULT_VERSION="$(tr -d '[:space:]' < "$ROOT_DIR/VERSION")"
fi

VERSION="$DEFAULT_VERSION"
BUILD=1
TAG=""
REPO="yuler/ear"
MIN_RUNNER_VERSION="0.0.1"
ASSETS_DIR="."
OUTPUT="latest.json"
CHECKSUMS="checksums.txt"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --build)
      BUILD="$2"
      shift 2
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    --min-runner-version)
      MIN_RUNNER_VERSION="$2"
      shift 2
      ;;
    --assets-dir)
      ASSETS_DIR="$2"
      shift 2
      ;;
    --output)
      OUTPUT="$2"
      shift 2
      ;;
    --checksums)
      CHECKSUMS="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "$TAG" ]; then
  TAG="v$VERSION"
fi

BASE_URL="https://github.com/$REPO/releases/download/$TAG"

get_sha256() {
  local f="$1"
  if [ -f "$f" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
      sha256sum "$f" | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then
      shasum -a 256 "$f" | awk '{print $1}'
    fi
  else
    echo ""
  fi
}

get_size() {
  local f="$1"
  if [ -f "$f" ]; then
    wc -c < "$f" | tr -d '[:space:]'
  else
    echo "null"
  fi
}

BUNDLE_PATH="$ASSETS_DIR/bundle.nshc"
BUNDLE_SHA="$(get_sha256 "$BUNDLE_PATH")"
BUNDLE_URL=""
if [ -f "$BUNDLE_PATH" ]; then
  BUNDLE_URL="$BASE_URL/bundle.nshc"
fi

LINUX_FILE="Ear-$VERSION-linux-x64.tar.gz"
LINUX_PATH="$ASSETS_DIR/$LINUX_FILE"
LINUX_SHA="$(get_sha256 "$LINUX_PATH")"
LINUX_SIZE="$(get_size "$LINUX_PATH")"

MACOS_FILE="Ear-$VERSION-macos-arm64.zip"
MACOS_PATH="$ASSETS_DIR/$MACOS_FILE"
MACOS_SHA="$(get_sha256 "$MACOS_PATH")"
MACOS_SIZE="$(get_size "$MACOS_PATH")"

WIN_FILE="Ear-$VERSION-windows-x64.zip"
WIN_PATH="$ASSETS_DIR/$WIN_FILE"
WIN_SHA="$(get_sha256 "$WIN_PATH")"
WIN_SIZE="$(get_size "$WIN_PATH")"

RELEASE_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

jq -n \
  --arg version "$VERSION" \
  --argjson build "$BUILD" \
  --arg minRunnerVersion "$MIN_RUNNER_VERSION" \
  --arg releaseDate "$RELEASE_DATE" \
  --arg changelog "Release $TAG" \
  --arg bundleUrl "$BUNDLE_URL" \
  --arg bundleSha256 "$BUNDLE_SHA" \
  --arg linuxFile "$LINUX_FILE" \
  --arg linuxUrl "$BASE_URL/$LINUX_FILE" \
  --arg linuxSha "$LINUX_SHA" \
  --argjson linuxSize "$LINUX_SIZE" \
  --arg macosFile "$MACOS_FILE" \
  --arg macosUrl "$BASE_URL/$MACOS_FILE" \
  --arg macosSha "$MACOS_SHA" \
  --argjson macosSize "$MACOS_SIZE" \
  --arg winFile "$WIN_FILE" \
  --arg winUrl "$BASE_URL/$WIN_FILE" \
  --arg winSha "$WIN_SHA" \
  --argjson winSize "$WIN_SIZE" \
  '{
    version: $version,
    build: $build,
    minRunnerVersion: $minRunnerVersion,
    releaseDate: $releaseDate,
    changelog: $changelog,
    bundleUrl: $bundleUrl,
    bundleSha256: $bundleSha256,
    platforms: {
      "linux-x86_64": { fileName: $linuxFile, url: $linuxUrl, sha256: $linuxSha, size: $linuxSize },
      "darwin-arm64": { fileName: $macosFile, url: $macosUrl, sha256: $macosSha, size: $macosSize },
      "windows-x86_64": { fileName: $winFile, url: $winUrl, sha256: $winSha, size: $winSize }
    }
  }' > "$OUTPUT"

echo "Manifest written to $OUTPUT"

if [ -n "$CHECKSUMS" ]; then
  : > "$CHECKSUMS"
  [ -n "$BUNDLE_SHA" ] && echo "$BUNDLE_SHA  bundle.nshc" >> "$CHECKSUMS"
  [ -n "$LINUX_SHA" ] && echo "$LINUX_SHA  $LINUX_FILE" >> "$CHECKSUMS"
  [ -n "$MACOS_SHA" ] && echo "$MACOS_SHA  $MACOS_FILE" >> "$CHECKSUMS"
  [ -n "$WIN_SHA" ] && echo "$WIN_SHA  $WIN_FILE" >> "$CHECKSUMS"
  if [ -s "$CHECKSUMS" ]; then
    echo "Checksums written to $CHECKSUMS"
  fi
fi
