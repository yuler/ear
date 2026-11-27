#!/usr/bin/env bash
# Run Ear native iOS unit tests on an available standard iPhone Simulator.
# Requires macOS with Xcode; generates ios/Ear.xcodeproj first.

set -euo pipefail

source "$(dirname "$0")/ios-lib.sh"
generate_xcode_project

SDK_VERSION="$(xcrun --sdk iphonesimulator --show-sdk-version 2>/dev/null || true)"

IFS=$'\t' read -r SIM_ID SIM_NAME SIM_RUNTIME < <(
  SDK_VERSION="$SDK_VERSION" IOS_SIMULATOR_ID="${IOS_SIMULATOR_ID:-}" \
    xcrun simctl list devices available -j | python3 -c '
import json, os, re, sys

data = json.load(sys.stdin)
override_id = os.environ.get("IOS_SIMULATOR_ID", "").strip()
sdk_raw = os.environ.get("SDK_VERSION", "").strip()

def parse_ver(text):
    nums = [int(x) for x in re.findall(r"\d+", text)]
    return tuple((nums + [0, 0, 0])[:3]) if nums else ()

def is_prewarmed_device(dev, udid):
    data_path = dev.get("dataPath") or os.path.expanduser(
        f"~/Library/Developer/CoreSimulator/Devices/{udid}/data"
    )
    sb_path = os.path.join(data_path, "Library", "SpringBoard")
    caches_path = os.path.join(data_path, "Library", "Caches")
    return int(os.path.isdir(sb_path) or os.path.isdir(caches_path))

sdk_ver = parse_ver(sdk_raw)
candidates = []

for rt_key, devices in data.get("devices", {}).items():
    if "SimRuntime.iOS" not in rt_key:
        continue
    rt_suffix = rt_key.split("SimRuntime.iOS", 1)[-1]
    rt_ver = parse_ver(rt_suffix)
    if sdk_ver:
        if rt_ver[:2] == sdk_ver[:2]:
            sdk_compat = 2
        elif rt_ver[:2] <= sdk_ver[:2]:
            sdk_compat = 1
        else:
            sdk_compat = 0
    else:
        sdk_compat = 1

    for idx, dev in enumerate(devices):
        if not dev.get("isAvailable"):
            continue
        udid = dev.get("udid", "")
        name = dev.get("name", "")
        state = dev.get("state", "Shutdown")
        if override_id and udid == override_id:
            print(f"{udid}\t{name}\t{rt_key}")
            sys.exit(0)
        if "iPhone" not in name:
            continue
        is_standard = int(not any(bad in name for bad in ("Duo", "Fold")))
        is_booted = int(state == "Booted" and sdk_compat >= 1)
        prewarmed = is_prewarmed_device(dev, udid)
        is_pro_flagship = int(bool(re.fullmatch(r"iPhone \d+ Pro", name)))
        candidates.append((
            (is_standard, is_booted, sdk_compat, rt_ver, prewarmed, is_pro_flagship, -idx),
            udid,
            name,
            rt_key,
        ))

if not candidates:
    sys.exit(1)

candidates.sort(key=lambda item: item[0], reverse=True)
_, udid, name, rt_key = candidates[0]
print(f"{udid}\t{name}\t{rt_key}")
'
)

cleanup() {
  if [[ "${CI:-}" == "true" ]]; then
    xcrun simctl shutdown "$SIM_ID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Using iOS Simulator: $SIM_NAME ($SIM_ID, $SIM_RUNTIME)"

xcodebuild test \
  -project "$IOS_PROJECT" \
  -scheme "$IOS_SCHEME" \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=$SIM_ID" \
  -parallel-testing-enabled NO \
  -enableCodeCoverage NO \
  COMPILER_INDEX_STORE_ENABLE=NO \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO
