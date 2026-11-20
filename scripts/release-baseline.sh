#!/usr/bin/env bash
# A tag or visible Release can exist before all release uploads finish.
# Only a completed, successful main release workflow is a shipped baseline.
set -euo pipefail
repo=${GITHUB_REPOSITORY:?Expected GITHUB_REPOSITORY}
if ! baseline=$(gh api "repos/$repo/actions/workflows/release.yml/runs?branch=main&status=success&per_page=1" --jq '.workflow_runs[0].head_sha // empty'); then
  echo "::warning::Cannot resolve a successful release; requiring a full update" >&2
  exit 0
fi
printf '%s\n' "$baseline"
