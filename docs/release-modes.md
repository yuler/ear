# Release delivery modes

The release workflow always builds the complete desktop archives. It now decides
whether the signed update manifest may also advertise an OTA package.

- **OTA (default for UI-only changes):** build the signed `.nshpkg` when release
  signing material is available and pass it to `nsh update-manifest --package`.
- **Full update:** skip OTA publication and never pass `--package`. Check the
  generated manifest has no `package` field before creating a tag or release.
  Manifest signing and platform archives are unchanged.

## Automatic selection

`prepare` compares the release commit with the source SHA of the most recent
**successful `release.yml` workflow on main**, covering all changes since that
completed release, not just the final commit. Tags remain the version-allocation
source only: a pushed tag, or a partially uploaded visible Release, is not proof
that delivery succeeded. A fresh retry or later UI commit still requires full
delivery until the native change has a successful release run. Any change to these inputs
requires a full update:

- `desktop/icon.*` (including this PR's installed icon), `desktop/nsh.json` (platform
  metadata, capabilities and updater trust/configuration).
- `cli/**`, `scripts/linux-launcher.sh` (native executable/bundle contents).
- `mise.toml` (pinned NSH runtime), `.github/workflows/release.yml` (packaging).

Added, removed and renamed paths are checked. Without a successful release (including an unavailable Actions API), delivery
defaults to full. An invalid comparison fails instead of silently selecting OTA. Changes confined to
TSX, styles or UI-imported assets do not force a full update.

## Manual override

Run the `release` workflow with `full_update: true` to force a full update for
other shell-affecting changes. The optional `tag` override is unchanged.
`full_update: false` enables automatic selection; it cannot override a detected
native change back to OTA. No PR label or commit-message marker is required.

The existing client checks OTA first, then full-app updates. Omitting `package`
lets it reach the normal full-update prompt; no client-side workaround is needed.
Normal release/update signing keys remain required for signed delivery. Without
release signing material, the existing full-app fallback remains in place.

Run `bash scripts/release.test.sh` for hermetic policy and manifest-command tests.
The same tests run in the required `Check & Test` CI job and release quality
gate, including failed-publication retry and later-UI-commit cases. The release
workflow needs `actions: read` to resolve successful runs.
