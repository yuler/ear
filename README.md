# Ear

Comprehensible-input English listening on [Native Shell](https://nsh.dev) (TSX).

Paste a YouTube link → download video/audio + subtitles → practice with Blind Flow / Loop Dojo.

## Stack

- `nsh init --template ts` — Desktop-first (linux/macos host); Mobile later
- Hand-parse YouTube player response (audio/video stream URLs + json3 captions)
- Native `fetch` saves captions + media ≤ 8 MiB write cap; larger media streams remotely
- Local catalog (Downbit-style, not SQLite): `dataDir/library/<videoId>.json` + `archive.jsonl` + `<videoId>/captions.json`
- Media files: `~/Downloads/<videoId>.{mp4,m4a}` by default (configurable in Settings)

## Project Structure

Referenced from [huacnlee/noop](https://github.com/huacnlee/noop):

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
mise run setup            # installs nsh + Linux WebKitGTK 6 (Arch: webkitgtk-6.0)
mise run dev              # native host (runs `nsh run app`)
mise run test             # runs `nsh test app`
mise run check            # runs `nsh check app`
```

GitHub writes: Cozilla41.

## CI

On push/PR to `main`, [.github/workflows/ci.yml](.github/workflows/ci.yml) installs tools via [mise](https://mise.jdx.dev) (`jdx/mise-action`) from `mise.toml` and runs `mise run check` + `mise run test`.
