# Ear

Comprehensible-input English listening on [Native Shell](https://nsh.dev) (TSX).

Paste a YouTube link → download video/audio + subtitles → practice with Blind Flow / Loop Dojo.

## Stack

- `nsh init --template ts` — Desktop-first (linux/macos host); Mobile later
- Rust `ear` CLI (`cli/`) — Parses YouTube VisionOS Innertube streams, video resolutions (`1080p`/`720p`/`480p`/`360p`/`Audio`), and subtitle tracks (`人工` Manual vs `CC 机翻` Auto), and runs 4-thread parallel HTTP Range downloads + `ffmpeg` muxing in the background with live speed (`MB/s`), ETA, and progress telemetry
- Local catalog (Downbit-style, not SQLite): `dataDir/library/<videoId>.json` + `archive.jsonl` + `<videoId>/captions.json`
- Media files: `~/Downloads/<videoId>.{mp4,m4a}` by default (configurable in Settings)

## Project Structure

Referenced from [huacnlee/noop](https://github.com/huacnlee/noop):

- `cli/` — Rust `ear` binary (`parse` / `captions` / `download`)
- `app/` — Standalone Native Shell desktop application
  - `app/App.tsx` — Root application shell & mode router
  - `app/ui/` — Shared UI components, icons, and theme design system
  - `app/views/` — Screen views (`LibraryView`, `SentencesView`, `BlindFlow`, `LoopDojo`)
  - `app/youtube/` — YouTube parsing, subtitle merging, and host fetch
  - `app/library/` — Local catalog, download management, and file persistence
  - `app/store.ts` — Settings & progress persistence
  - `app/player.ts` — Audio/video engine & playback rate controller
  - `app/clipboard.ts` — System clipboard monitor
- `docs/` — Architecture & learning workflow design specs ([docs/modes-design.md](docs/modes-design.md), [docs/discover-design.md](docs/discover-design.md))
- `api/discover/` — Static zero-backend Discover catalog (`index.json`, `en.json`, `ja.json`)
- `scripts/` — Environment setup & host installation scripts

## Discover Recommendations

Ear's **Discover** catalog is hosted directly in this repository under [`api/discover/`](api/discover/) as a zero-server static data source:

- [`api/discover/index.json`](api/discover/index.json): Schema version, updatedAt timestamp, and list of language files.
- [`api/discover/en.json`](api/discover/en.json): English comprehensible input videos (CEFR levels A1–C1).
- [`api/discover/ja.json`](api/discover/ja.json): Japanese listening videos (JLPT levels N5–N1).

The desktop app syncs from GitHub via the Rust `ear discover` command with a 24-hour local cache (`~/.cache/ear/discover/`).

### Contributing Videos

Community contributions are warmly welcome! You can recommend videos in two ways:
1. **GitHub Issue**: Submit via the [Recommend Video issue template](.github/ISSUE_TEMPLATE/video-recommendation.yml).
2. **Pull Request**: Add your recommendation directly to [`api/discover/en.json`](api/discover/en.json) or [`api/discover/ja.json`](api/discover/ja.json). CI automatically validates the JSON format and schema against `cargo test`.

## Develop

```sh
mise run setup            # installs nsh, release `ear` CLI, Linux WebKitGTK 6
mise run doctor           # checks system dependencies (WebKitGTK, GStreamer, ffmpeg)
mise run cli:build        # release-build + install `ear` → ~/.local/bin/ear
mise run cli:dev          # debug-build + install `ear` (used by app:dev)
mise run app:dev          # rebuilds CLI (debug) then starts native desktop app (alias: run)
mise run www:dev          # local preview for website & Cloudflare Worker (wrangler dev)
mise run dev              # parallel all *:dev (cli + app + www)
mise run www:deploy       # deploy website & Cloudflare Worker (wrangler deploy)
mise run test             # `cargo test` (cli) + `nsh test app`
mise run check            # runs `nsh check app`
```

### Linux Dependencies

Ear on Linux relies on `webkitgtk-6.0` for web view rendering and `gstreamer` plugins for MP4/H.264/AAC media playback.

Run `ear doctor` (or `mise run doctor`) to verify your environment anytime.

To install manually for your distribution:
- **Arch / Omarchy**: `sudo pacman -S webkitgtk-6.0 gst-plugins-good gst-libav gst-plugins-ugly gst-plugins-bad`
- **Ubuntu / Debian**: `sudo apt install libwebkitgtk-6.0-4 gstreamer1.0-plugins-good gstreamer1.0-libav gstreamer1.0-plugins-bad`
- **Fedora**: `sudo dnf install webkitgtk6.0 gstreamer1-plugins-good gstreamer1-plugin-libav`
- **openSUSE**: `sudo zypper install libwebkitgtk-6_0-4 gstreamer-plugins-good gstreamer-plugins-libav`

GitHub writes: Cozilla41.

## CI & Release

- **CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)): Runs on pull requests to `main`, installing tools via [mise](https://mise.jdx.dev) (`jdx/mise-action`) and running `mise run check` + `mise run test`.
- **Website & Worker Deployment** ([.github/workflows/www-deploy.yml](.github/workflows/www-deploy.yml)): Automatically deploys the landing website and Cloudflare Worker (`ear.yuler.dev`) on pushes to `main` touching `www/**` when `CLOUDFLARE_API_TOKEN` is configured.
- **Automated Trunk Release** ([.github/workflows/release.yml](.github/workflows/release.yml)): Every merged PR or direct push to `main` (excluding pure doc changes) triggers an automated release. CI passes quality gates, resolves the next patch version, tags the commit, matrix-builds Linux x86_64, macOS aarch64, and Windows x86_64 packages with the bundled Rust `ear` CLI, and outputs signed incremental OTA packages (`dev.yuler.ear-*.nshpkg`, ~200KB) + signed `latest.json` manifest via `nsh update-manifest`. See [docs/release-design.md](docs/release-design.md) for full architecture details.
- **Auto Update**: Ear uses `nsh/updater` to check and install updates. UI and logic changes are applied incrementally via signed packages without touching macOS code signatures or requiring Linux root permissions, restarting instantly with `restartToPackage()`; major engine updates prompt full installer downloads.
