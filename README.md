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
# install: curl -fsSL https://nsh.dev/install.sh | sh
nsh run          # native host on this OS
nsh run --target web
nsh test
nsh check
```

GitHub writes: Cozilla41.

## CI

On push/PR to `main`, [.github/workflows/ci.yml](.github/workflows/ci.yml) installs `nsh` `v0.4.0` and runs `nsh check` + `nsh test`.
