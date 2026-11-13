#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" == "Darwin" ]]; then
  DEFAULT_BASE="${HOME}/Library/Application Support/dev.yuler.ear"
else
  DEFAULT_BASE="${XDG_DATA_HOME:-${HOME}/.local/share}/dev.yuler.ear"
fi

BASE_DIR="${EAR_BASE_DIR:-$DEFAULT_BASE}"
SRC="${1:-${BASE_DIR}/library}"
DST="${2:-${BASE_DIR}/dev/library}"

if [[ ! -d "$SRC" ]]; then
  echo "No Production library found at: $SRC" >&2
  exit 1
fi

mkdir -p "$DST"
cp -a "${SRC}/." "${DST}/"

# Remap only library-internal paths (prefixed with SRC) to DST in entry JSONs and archive.jsonl,
# leaving external/shared media paths (e.g. ~/Downloads/...) untouched.
python3 - "$SRC" "$DST" << 'PY'
import json
import os
import sys
from pathlib import Path

src_root = os.path.normpath(os.path.abspath(sys.argv[1]))
dst_root = os.path.normpath(os.path.abspath(sys.argv[2]))

def remap_value(val):
    if isinstance(val, str):
        if val == src_root:
            return dst_root
        if val.startswith(src_root + os.sep):
            return dst_root + val[len(src_root):]
        return val
    if isinstance(val, list):
        return [remap_value(v) for v in val]
    if isinstance(val, dict):
        return {k: remap_value(v) for k, v in val.items()}
    return val

dst_path = Path(dst_root)

for json_file in dst_path.rglob("*.json"):
    try:
        data = json.loads(json_file.read_text(encoding="utf-8"))
    except Exception:
        continue
    updated = remap_value(data)
    if updated != data:
        json_file.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

archive_file = dst_path / "archive.jsonl"
if archive_file.is_file():
    lines = archive_file.read_text(encoding="utf-8").splitlines()
    out_lines = []
    changed = False
    for line in lines:
        if not line.strip():
            out_lines.append(line)
            continue
        try:
            obj = json.loads(line)
        except Exception:
            out_lines.append(line)
            continue
        updated = remap_value(obj)
        if updated != obj:
            changed = True
        out_lines.append(json.dumps(updated, ensure_ascii=False))
    if changed:
        archive_file.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
PY

echo "Imported Production library from $SRC -> $DST"
