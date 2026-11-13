# AGENTS.md

Guidelines for coding agents for this repo

## Rules

### Git & PR Workflow

- **PR-first development**: All development must go through Pull Requests (PRs). Work on dedicated feature/bugfix branches; do not push directly to `main`.
- **Commit & PR title format**: `emoji [scope] The main change` — example: `✨ [core] Adopt shared account slug tenancy for personal and team`. PR title follows the exact same format.
- **No agent trailers**: Do not add agent trailers to commits (`Made-with:`, `Co-Authored-By: Claude`, Cursor, etc.). Message body only when it adds real context.
- **Explicit git operations**: Do not run `git commit` / `git push` unless explicitly requested.
- **Automated trunk release & versioning**: Single source of truth for versioning is Git Tags (`v*`). Releases are 100% automated by CI upon merge/push to `main`. Subprojects (`app/nsh.json`, `cli/Cargo.toml`) use `"0.0.0"` locally as development placeholders, and have their release version dynamically injected during CI packaging.

### Code & Architecture

- **Simplicity first**: Keep everything from design to code as simple as possible. Avoid speculative over-engineering.
- **File size limit**: Keep each agent-authored file under 5,000 tokens (bytes ÷ 4). Lockfiles and generated code sit outside this limit. Split a file that would cross it by responsibility: one module per concern, helpers and types in a sibling file, and a one-line pointer in the original naming the new path.

### Agent Behavior & Formatting

- **Clarify before assuming**: If something is unclear, ask questions.
- **Restricted skills**: Do not use superpower or other speculative-driven skills unless explicitly declared.
- **Table alignment**: Markdown tables must be auto-aligned (pad columns so pipes line up).
