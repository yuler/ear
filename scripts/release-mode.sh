#!/usr/bin/env bash
# Resolve changes since the last successful release workflow, not merely the last commit.
set -euo pipefail
base=${1:-}
head=${2:-HEAD}
force_full=${3:-false}
case "$force_full" in
  true) echo full; exit 0 ;;
  false) ;;
  *) echo "Invalid full-update override: $force_full" >&2; exit 1 ;;
esac
if [ -z "$base" ]; then
  echo full
  exit 0
fi
# Do not silently offer OTA when the comparison cannot be resolved.
changed=$(git diff --name-only --no-renames "$base" "$head" --)
while IFS= read -r path; do
  case "$path" in
    app/icon.*|app/nsh.json|cli/*|mise.toml|scripts/linux-launcher.sh|.github/workflows/release.yml)
      echo full
      exit 0
      ;;
  esac
done <<< "$changed"
echo ota
