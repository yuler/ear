# Ear

Comprehensible-input English listening on [Native Shell](https://nsh.dev) (TSX).

## Stack

- `nsh init --template ts` — Desktop + Mobile from one codebase
- Hand-parse YouTube `ytInitialPlayerResponse` (audio/mp4 + json3 captions)
- **No yt-dlp**

## Modules

1. **Parse / sentences** — `youtube/`
2. **Blind Flow** — blur captions + Pass / Lag / Blind
3. **Loop Dojo** — A-B loop + word Diff + 0.8/1/1.2 (this PR)
4. **Persist + chrome** — local progress, keyboard + mobile chrome

## Develop

```sh
mise run setup            # installs nsh + Linux WebKitGTK 6 (Arch: webkitgtk-6.0)
mise run dev              # native host on this OS (alias: mise run run)
nsh run --target web
mise run test
mise run check
```

GitHub writes: Cozilla41.

## CI

On push/PR to `main`, [.github/workflows/ci.yml](.github/workflows/ci.yml) installs tools via [mise](https://mise.jdx.dev) (`jdx/mise-action`) from `mise.toml` and runs `mise run check` + `mise run test`.
