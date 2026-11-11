#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd))"
VERSION_FILE="$ROOT_DIR/VERSION"

OVERRIDE_TAG=""
GITHUB_OUTPUT_FILE=""
NOTES_FILE=""
REPO="${GITHUB_REPOSITORY:-yuler/ear}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --override-tag)
      OVERRIDE_TAG="$2"
      shift 2
      ;;
    --github-output)
      GITHUB_OUTPUT_FILE="$2"
      shift 2
      ;;
    --notes-file)
      NOTES_FILE="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

parse_semver() {
  local v="${1#v}"
  local major minor patch
  major=$(echo "$v" | cut -d. -f1)
  minor=$(echo "$v" | cut -d. -f2)
  patch=$(echo "$v" | cut -d. -f3 | cut -d- -f1)
  echo "${major:-0} ${minor:-0} ${patch:-0}"
}

BASE_VERSION="0.0.1"
if [ -f "$VERSION_FILE" ]; then
  BASE_VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
fi

if [ -n "$OVERRIDE_TAG" ]; then
  TAG="$OVERRIDE_TAG"
  VERSION="${TAG#v}"
else
  # Fetch tags if in git repo
  LATEST_TAG=""
  if git rev-parse --git-dir >/dev/null 2>&1; then
    LATEST_TAG="$(git tag --sort=-v:refname -l "v*" 2>/dev/null | head -n 1 || true)"
  fi

  if [ -z "$LATEST_TAG" ]; then
    VERSION="$BASE_VERSION"
    TAG="v$VERSION"
  else
    read -r base_maj base_min base_pat <<< "$(parse_semver "$BASE_VERSION")"
    read -r tag_maj tag_min tag_pat <<< "$(parse_semver "$LATEST_TAG")"

    if [ "$base_maj" -gt "$tag_maj" ]; then
      VERSION="$BASE_VERSION"
    elif [ "$base_maj" -eq "$tag_maj" ] && [ "$base_min" -gt "$tag_min" ]; then
      VERSION="$BASE_VERSION"
    elif [ "$base_maj" -eq "$tag_maj" ] && [ "$base_min" -eq "$tag_min" ] && [ "$base_pat" -gt "$tag_pat" ]; then
      VERSION="$BASE_VERSION"
    else
      # Increment patch on latest tag
      NEXT_PATCH=$((tag_pat + 1))
      VERSION="$tag_maj.$tag_min.$NEXT_PATCH"
    fi
    TAG="v$VERSION"
  fi
fi

BUILD="1"
if git rev-parse --git-dir >/dev/null 2>&1; then
  BUILD="$(git rev-list --count HEAD 2>/dev/null || echo 1)"
fi

# Extract commit metadata
COMMIT_SUBJECT="Release $TAG"
COMMIT_BODY=""
COMMIT_SHA=""
SHORT_SHA=""
AUTHOR="GitHub Actions"

if git rev-parse --git-dir >/dev/null 2>&1; then
  COMMIT_SUBJECT="$(git log -1 --format="%s" 2>/dev/null || echo "Release $TAG")"
  COMMIT_BODY="$(git log -1 --format="%b" 2>/dev/null || echo "")"
  COMMIT_SHA="$(git log -1 --format="%H" 2>/dev/null || echo "")"
  SHORT_SHA="$(git log -1 --format="%h" 2>/dev/null || echo "")"
  AUTHOR="$(git log -1 --format="%an" 2>/dev/null || echo "Maintainer")"
fi

RELEASE_TITLE="$TAG — $COMMIT_SUBJECT"
CHANGELOG="$TAG — $COMMIT_SUBJECT"

# Construct Release Body
RELEASE_BODY=$(cat <<EOF
### What's Changed
**${COMMIT_SUBJECT}**

${COMMIT_BODY}

---
- **Commit**: [\`${SHORT_SHA}\`](https://github.com/${REPO}/commit/${COMMIT_SHA})
- **Author**: ${AUTHOR}
EOF
)

echo "Resolved Release Metadata:"
echo "  TAG:           $TAG"
echo "  VERSION:       $VERSION"
echo "  BUILD:         $BUILD"
echo "  RELEASE_TITLE: $RELEASE_TITLE"
echo "  CHANGELOG:     $CHANGELOG"

if [ -n "$GITHUB_OUTPUT_FILE" ]; then
  {
    echo "tag=$TAG"
    echo "version=$VERSION"
    echo "build=$BUILD"
    echo "release_title=$RELEASE_TITLE"
    echo "changelog=$CHANGELOG"
    echo "commit_sha=$COMMIT_SHA"
    echo "short_sha=$SHORT_SHA"
    echo "author=$AUTHOR"
    echo "release_body<<EOF"
    echo "$RELEASE_BODY"
    echo "EOF"
  } >> "$GITHUB_OUTPUT_FILE"
  echo "Written outputs to $GITHUB_OUTPUT_FILE"
fi

if [ -n "$NOTES_FILE" ]; then
  mkdir -p "$(dirname "$NOTES_FILE")"
  echo "$RELEASE_BODY" > "$NOTES_FILE"
  echo "Release notes written to $NOTES_FILE"
fi
