#!/usr/bin/env bash
# Generate ios/Ear.xcodeproj from ios/project.yml using the resolved version
# (EAR_VERSION env override or latest vX.Y.Z Git tag).

set -euo pipefail

source "$(dirname "$0")/ios-lib.sh"
generate_xcode_project
