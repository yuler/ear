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
- `docs/` — Architecture & learning workflow design specs ([docs/modes-design.md](docs/modes-design.md))
- `scripts/` — Environment setup & host installation scripts

## Develop

```sh
mise run setup            # installs nsh, release `ear` CLI, Linux WebKitGTK 6
mise run build-cli        # release-build + install `ear` → ~/.local/bin/ear
mise run build-cli-dev    # debug-build + install `ear` (used by `dev`)
mise run dev              # rebuilds CLI (debug) then `nsh run app`
mise run test             # `cargo test` (cli) + `nsh test app`
mise run check            # runs `nsh check app`
```

GitHub writes: Cozilla41.

## CI & Release

- **CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)): Runs on push/PR to `main`, installing tools via [mise](https://mise.jdx.dev) (`jdx/mise-action`) and running `mise run check` + `mise run test`.
- **Release** ([.github/workflows/release.yml](.github/workflows/release.yml)): Triggered on `v*` tags or manual `workflow_dispatch`. Matrix builds Linux x64, macOS arm64, and Windows x64 desktop packages with the bundled Rust `ear` CLI, generates the `latest.json` release manifest, and outputs incremental bytecode updates (`bundle.nshc`, ~200KB) alongside full binary packages.
- **Auto Update**: Ear checks `latest.json` from GitHub Releases. UI/logic updates are applied incrementally without re-downloading the entire runner package; major engine updates prompt full installer downloads.
