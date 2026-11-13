#!/usr/bin/env bash
set -euo pipefail

# Regression test: import-prod.sh must remap library-internal paths from SRC -> DST
# in entry JSONs and archive.jsonl, preserve external paths, and ensure deleting
# imported Dev files leaves Production source files intact.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

SRC="$TMP_ROOT/prod/library"
DST="$TMP_ROOT/prod/dev/library"
EXT_MEDIA="$TMP_ROOT/Downloads/external.mp4"
mkdir -p "$SRC/vid1" "$SRC/vid2" "$TMP_ROOT/Downloads"

echo "prod-captions" > "$SRC/vid1/captions.json"
echo "prod-video" > "$SRC/vid1/video.mp4"
echo "external-video" > "$EXT_MEDIA"

cat > "$SRC/vid1.json" << EOF
{
  "videoId": "vid1",
  "captionsPath": "$SRC/vid1/captions.json",
  "videoPath": "$SRC/vid1/video.mp4"
}
EOF

cat > "$SRC/vid2.json" << EOF
{
  "videoId": "vid2",
  "captionsPath": "$SRC/vid2/captions.json",
  "videoPath": "$EXT_MEDIA"
}
EOF

cat > "$SRC/archive.jsonl" << EOF
{"videoId":"vid1","videoPath":"$SRC/vid1/video.mp4","captionsPath":"$SRC/vid1/captions.json"}
{"videoId":"vid2","videoPath":"$EXT_MEDIA","captionsPath":"$SRC/vid2/captions.json"}
EOF

bash "$REPO_ROOT/scripts/import-prod.sh" "$SRC" "$DST" >/dev/null

# 1. Internal paths in entry JSON and archive.jsonl are remapped to DST
grep -q "\"$DST/vid1/captions.json\"" "$DST/vid1.json"
grep -q "\"$DST/vid1/video.mp4\"" "$DST/vid1.json"
! grep -q "\"$SRC/vid1/" "$DST/vid1.json"

grep -q "\"$DST/vid1/video.mp4\"" "$DST/archive.jsonl"
! grep -q "\"$SRC/vid1/" "$DST/archive.jsonl"

# 2. External/shared media paths are preserved untouched
grep -q "\"$EXT_MEDIA\"" "$DST/vid2.json"
grep -q "\"$EXT_MEDIA\"" "$DST/archive.jsonl"

# 3. Deleting imported Dev media path leaves Production source file intact
REMAPPED_VIDEO=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["videoPath"])' "$DST/vid1.json")
test "$REMAPPED_VIDEO" = "$DST/vid1/video.mp4"
rm -f "$REMAPPED_VIDEO"
test -f "$SRC/vid1/video.mp4"
grep -q "prod-video" "$SRC/vid1/video.mp4"

echo "PASS: import-prod.test.sh remapped internal paths, preserved external paths, and isolated Dev deletion"
