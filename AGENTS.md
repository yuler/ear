# AGENTS.md

Guidelines for coding agents for this repo

## Rules

- Git commit title format: `emoji [scope] The main change` — example: `✨ [core] Adopt shared account slug tenancy for personal and team`
- Do not add agent trailers to commits (`Made-with:`, `Co-Authored-By: Claude`, Cursor, etc.). Message body only when it adds real context.
- Do not run `git commit` / `git push` unless explicitly requested.
- PR title follows the same format as the git commit title.
- Markdown tables must be auto-aligned (pad columns so pipes line up).
- Do not use superpower or other speculative-driven skills unless explicitly declared.
- If something is unclear, ask questions. Keep everything from design to code as simple as possible.
- Keep each agent-authored file under 5,000 tokens (bytes ÷ 4). Lockfiles and generated code sit outside this limit. Split a file that would cross it by responsibility: one module per concern, helpers and types in a sibling file, and a one-line pointer in the original naming the new path.
- Single source of truth for versioning is the root `VERSION` file (starting at `0.0.1`). All subprojects, packages, workflows, and modules (`app/nsh.json`, `cli/Cargo.toml`, CI/CD workflows, updater) must derive their version from `VERSION`. Use `scripts/version.sh` (powered by `gum`) to manage versioning: `scripts/version.sh bump [patch|minor|major]` to upgrade and `scripts/version.sh sync` to synchronize across the repo.

