#!/usr/bin/env bash
# Run from the repository root after platform archives, keys and notes are ready.
set -euo pipefail
mode=${1:?Expected full or ota}
build=${2:?Expected build number}
case "$mode" in
  full|ota) ;;
  *) echo "Invalid release mode: $mode" >&2; exit 1 ;;
esac
pkg="dist/dev.yuler.ear-${build}.nshpkg"
package_args=()
if [ "$mode" = ota ] && [ -f keys/release.secret ] && [ -f keys/release.cert ]; then
  nsh publish --key keys/release.secret --cert keys/release.cert --build "$build" -o "$pkg" app/
  package_args=(--package "$pkg")
fi
key_args=()
if [ -f keys/update.secret ]; then
  key_args=(--key keys/update.secret)
else
  echo "::warning::keys/update.secret is missing; using an unsigned fallback manifest"
  jq 'del(.updater)' app/nsh.json > app/nsh.json.tmp
  mv app/nsh.json.tmp app/nsh.json
fi
nsh update-manifest dist/Ear-*.tar.gz dist/Ear-*.zip "${package_args[@]}" "${key_args[@]}" --entry app/ --notes dist/release_notes.md -o dist/
# Verify the actual generated manifest, before tagging or publishing anything.
if [ "$mode" = full ]; then
  jq -e 'has("package") | not' dist/latest.json >/dev/null
elif [ "${#package_args[@]}" -gt 0 ]; then
  jq -e '.package != null' dist/latest.json >/dev/null
fi
