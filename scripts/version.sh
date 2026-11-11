#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd))"

# Ensure gum fallback if gum is not available
has_gum() {
  command -v gum >/dev/null 2>&1
}

log_info() {
  if has_gum; then
    gum log --level info "$1"
  else
    echo "INFO: $1"
  fi
}

log_success() {
  if has_gum; then
    gum style --foreground 82 "✔ $1"
  else
    echo "✔ $1"
  fi
}

log_error() {
  if has_gum; then
    gum log --level error "$1"
  else
    echo "ERROR: $1" >&2
  fi
}

get_current_version() {
  local tag=""
  if git rev-parse --git-dir >/dev/null 2>&1; then
    tag="$(git tag --sort=-v:refname -l "v*" 2>/dev/null | head -n 1 || true)"
  fi
  if [ -n "$tag" ]; then
    echo "${tag#v}"
  elif [ -f "$ROOT_DIR/app/nsh.json" ]; then
    jq -r '.version // "0.0.1"' "$ROOT_DIR/app/nsh.json"
  else
    echo "0.0.1"
  fi
}

do_sync() {
  local version="${1:-$(get_current_version)}"
  log_info "Synchronizing repository version to $version..."

  # 1. Update app/nsh.json via jq
  local nsh_json="$ROOT_DIR/app/nsh.json"
  if [ -f "$nsh_json" ]; then
    local tmp_json="${nsh_json}.tmp"
    jq --arg v "$version" '.version = $v' "$nsh_json" > "$tmp_json"
    mv "$tmp_json" "$nsh_json"
    log_success "Updated app/nsh.json → $version"
  fi

  # 2. Update cli/Cargo.toml & Cargo.lock
  local cargo_toml="$ROOT_DIR/cli/Cargo.toml"
  if [ -f "$cargo_toml" ]; then
    local tmp_cargo="${cargo_toml}.tmp"
    sed -E '0,/version = ".*"/s/version = ".*"/version = "'"$version"'"/' "$cargo_toml" > "$tmp_cargo"
    mv "$tmp_cargo" "$cargo_toml"
    log_success "Updated cli/Cargo.toml → $version"
    cargo check --manifest-path "$cargo_toml" --quiet 2>/dev/null || true
    log_success "Updated cli/Cargo.lock"
  fi

  log_success "Version sync completed across all targets."
}

bump_semver() {
  local current="$1"
  local type="$2"

  local clean="${current#v}"
  local major minor patch
  major=$(echo "$clean" | cut -d. -f1)
  minor=$(echo "$clean" | cut -d. -f2)
  patch=$(echo "$clean" | cut -d. -f3 | cut -d- -f1)

  major=${major:-0}
  minor=${minor:-0}
  patch=${patch:-0}

  case "$type" in
    patch)
      echo "$major.$minor.$((patch + 1))"
      ;;
    minor)
      echo "$major.$((minor + 1)).0"
      ;;
    major)
      echo "$((major + 1)).0.0"
      ;;
    *)
      echo "$type"
      ;;
  esac
}

do_bump() {
  local current
  current="$(get_current_version)"
  local target_type="${1:-}"

  if [ -z "$target_type" ]; then
    if has_gum && [ -t 0 ]; then
      gum style --border normal --margin "1" --padding "1" --border-foreground 212 \
        "Current version: $(gum style --bold --foreground 82 "$current")"

      local patch_target minor_target major_target
      patch_target="$(bump_semver "$current" patch)"
      minor_target="$(bump_semver "$current" minor)"
      major_target="$(bump_semver "$current" major)"

      local choice
      choice=$(gum choose \
        "patch ($patch_target)" \
        "minor ($minor_target)" \
        "major ($major_target)" \
        "custom")

      case "$choice" in
        patch*) target_type="patch" ;;
        minor*) target_type="minor" ;;
        major*) target_type="major" ;;
        custom)
          target_type=$(gum input --placeholder "Enter custom version (e.g. 1.0.0)")
          ;;
      esac
    else
      target_type="patch"
    fi
  fi

  local next_version
  next_version="$(bump_semver "$current" "$target_type")"

  if has_gum && [ -t 0 ] && [ -z "${1:-}" ]; then
    if ! gum confirm "Bump version from $current to $next_version?"; then
      log_info "Version bump cancelled."
      exit 0
    fi
  fi

  # Bump build number in app/nsh.json via jq
  local nsh_json="$ROOT_DIR/app/nsh.json"
  if [ -f "$nsh_json" ]; then
    local tmp_json="${nsh_json}.tmp"
    jq '.build = ((.build // 0) + 1)' "$nsh_json" > "$tmp_json"
    mv "$tmp_json" "$nsh_json"
  fi

  log_success "Target Version: $current → $next_version"
  do_sync "$next_version"

  if git rev-parse --git-dir >/dev/null 2>&1; then
    if git rev-parse -q --verify "refs/tags/v$next_version" >/dev/null; then
      log_info "Tag v$next_version already exists."
    else
      git tag -a "v$next_version" -m "Release v$next_version"
      log_success "Created Git tag: v$next_version"
    fi
  fi
}

show_status() {
  local current
  current="$(get_current_version)"
  if has_gum; then
    gum style --foreground 212 --bold "Ear Version: " "$(gum style --foreground 82 "$current")"
  else
    echo "Ear Version: $current"
  fi
}

main() {
  local cmd="${1:-}"

  if [ -z "$cmd" ]; then
    if has_gum && [ -t 0 ]; then
      cmd=$(gum choose "bump" "sync" "show" "exit")
    else
      show_status
      exit 0
    fi
  fi

  case "$cmd" in
    bump)
      shift || true
      do_bump "${1:-}"
      ;;
    sync)
      shift || true
      do_sync "${1:-}"
      ;;
    show|get)
      show_status
      ;;
    exit)
      exit 0
      ;;
    *)
      log_error "Unknown command: $cmd"
      echo "Usage: $0 [bump <patch|minor|major|version> | sync [version] | show]"
      exit 1
      ;;
  esac
}

main "$@"
