#!/usr/bin/env python3
"""
Generate latest.json release manifest and checksums.txt for Ear releases.
"""

import argparse
import datetime
import hashlib
import json
import os
import sys
from pathlib import Path


def sha256_file(filepath: Path) -> str:
    if not filepath.is_file():
        return ""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Generate release manifest")
    parser.add_argument("--version", required=True, help="App semver version, e.g. 1.0.0")
    parser.add_argument("--build", type=int, default=1, help="App build number")
    parser.add_argument("--tag", required=True, help="Git release tag, e.g. v1.0.0")
    parser.add_argument("--repo", default="yuler/ear", help="GitHub repo slug, e.g. yuler/ear")
    parser.add_argument("--min-runner-version", default="1.0.0", help="Minimum required runner version")
    parser.add_argument("--assets-dir", default=".", help="Directory containing release assets")
    parser.add_argument("--output", default="latest.json", help="Output JSON path")
    parser.add_argument("--checksums", default="checksums.txt", help="Output checksums file")

    args = parser.parse_args()
    assets_dir = Path(args.assets_dir)
    base_url = f"https://github.com/{args.repo}/releases/download/{args.tag}"

    bundle_path = assets_dir / "bundle.nshc"
    bundle_hash = sha256_file(bundle_path)

    platforms_def = {
        "linux-x86_64": f"Ear-{args.version}-linux-x64.tar.gz",
        "darwin-arm64": f"Ear-{args.version}-macos-arm64.zip",
        "windows-x86_64": f"Ear-{args.version}-windows-x64.zip",
    }

    platforms_manifest = {}
    checksum_lines = []

    if bundle_path.is_file():
        checksum_lines.append(f"{bundle_hash}  bundle.nshc")

    for platform_key, filename in platforms_def.items():
        file_path = assets_dir / filename
        h = sha256_file(file_path)
        size = file_path.stat().st_size if file_path.is_file() else None
        if h:
            checksum_lines.append(f"{h}  {filename}")

        platforms_manifest[platform_key] = {
            "fileName": filename,
            "url": f"{base_url}/{filename}",
            "sha256": h,
            "size": size,
        }

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    manifest = {
        "version": args.version,
        "build": args.build,
        "minRunnerVersion": args.min_runner_version,
        "releaseDate": now_iso,
        "changelog": f"Release {args.tag}",
        "bundleUrl": f"{base_url}/bundle.nshc" if bundle_path.is_file() else "",
        "bundleSha256": bundle_hash,
        "platforms": platforms_manifest,
    }

    output_path = Path(args.output)
    output_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Manifest written to {output_path}")

    if args.checksums and checksum_lines:
        checksum_path = Path(args.checksums)
        checksum_path.write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")
        print(f"Checksums written to {checksum_path}")


if __name__ == "__main__":
    main()
