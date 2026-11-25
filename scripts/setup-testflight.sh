#!/usr/bin/env bash
# Bootstrap App Store Connect, TestFlight groups, and GitHub Actions secrets for Ear.
# Mutating commands default to dry-run mode; pass --apply to execute them.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Ear"
BUNDLE_ID="dev.yuler.ear"
APP_SKU="ear"
PRIMARY_LOCALE="zh-Hans"
INTERNAL_GROUP="Internal"
EXTERNAL_GROUP="${TESTFLIGHT_EXTERNAL_GROUP:-External}"
ENV_FILE="$ROOT/.env"
APP_ID="${ASC_APP_ID:-}"
DRY_RUN=1

REQUIRED_SECRETS=(
  APP_STORE_CONNECT_KEY_ID
  APP_STORE_CONNECT_ISSUER_ID
  APP_STORE_CONNECT_API_KEY_BASE64
  IOS_DEVELOPMENT_TEAM
  IOS_DISTRIBUTION_CERT_P12_BASE64
  IOS_DISTRIBUTION_CERT_PASSWORD
)

usage() {
  cat <<'EOF'
Usage: ./scripts/setup-testflight.sh <subcommand> [options]

Subcommands:
  check          Verify local tools (asc, gh), .env secrets, and optional ASC_APP_ID
  init-app       Register Bundle ID and create App Store Connect app for Ear
  setup-groups   Create Internal and External TestFlight groups for an App ID
  push-secrets   Push iOS TestFlight .env secrets (and optional ASC_APP_ID variable) to GitHub

Options:
  --app-id <id>  App Store Connect App ID (or set ASC_APP_ID env var)
  --env <path>   Path to .env file (default: <repo>/.env)
  --dry-run      Print commands without executing (default for mutating subcommands)
  --apply        Execute commands instead of dry-run
  -h, --help     Show this help message
EOF
}

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

require_tool() {
  local tool="$1"
  local hint="$2"
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing required tool: $tool ($hint)" >&2
    return 1
  fi
}

read_env_value() {
  local key="$1"
  local file="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | head -n 1 | cut -d'=' -f2- | tr -d '\r' || true
}

cmd_check() {
  local ok=0

  echo "=== Ear TestFlight Readiness Check ==="
  echo "App:       $APP_NAME ($BUNDLE_ID, SKU: $APP_SKU, locale: $PRIMARY_LOCALE)"
  echo "Env file:  $ENV_FILE"
  echo ""

  if command -v asc >/dev/null 2>&1; then
    echo "[ok] asc: $(command -v asc)"
  else
    echo "[missing] asc — install with: curl -fsSL https://asccli.sh/install | bash"
    ok=1
  fi

  if command -v gh >/dev/null 2>&1; then
    echo "[ok] gh: $(command -v gh)"
    if gh auth status >/dev/null 2>&1; then
      echo "[ok] gh auth: logged in"
    else
      echo "[warn] gh auth: not logged in (run: gh auth login)"
      ok=1
    fi
  else
    echo "[missing] gh — install GitHub CLI first"
    ok=1
  fi

  if [[ -f "$ENV_FILE" ]]; then
    echo "[ok] $ENV_FILE exists"
    for key in "${REQUIRED_SECRETS[@]}"; do
      local val
      val="$(read_env_value "$key" "$ENV_FILE")"
      if [[ -n "$val" ]]; then
        echo "  [ok] $key is set"
      else
        echo "  [missing] $key is empty in $ENV_FILE"
        ok=1
      fi
    done
  else
    echo "[missing] $ENV_FILE not found (copy from .env.example)"
    ok=1
  fi

  if [[ -n "$APP_ID" ]]; then
    echo "[ok] ASC_APP_ID=$APP_ID"
  else
    echo "[info] ASC_APP_ID not set yet (optional until App Store Connect app is created)"
  fi

  return "$ok"
}

cmd_init_app() {
  if [[ "$DRY_RUN" -eq 0 ]]; then
    require_tool asc "curl -fsSL https://asccli.sh/install | bash"
  fi

  echo "=== Register Bundle ID & Create App Store Connect App ==="
  echo "Note: Ensure you have run 'asc auth login' (API key) and 'asc web auth login' (Apple ID)."
  echo ""

  run_cmd asc bundle-ids create \
    --identifier "$BUNDLE_ID" \
    --name "$APP_NAME" \
    --platform IOS

  run_cmd asc web apps create \
    --name "$APP_NAME" \
    --bundle-id "$BUNDLE_ID" \
    --sku "$APP_SKU" \
    --primary-locale "$PRIMARY_LOCALE" \
    --platform IOS \
    --auto-rename=false \
    --if-exists skip

  echo ""
  echo "Next: record the created App ID and run:"
  echo "  ./scripts/setup-testflight.sh setup-groups --app-id <APP_ID> --apply"
}

cmd_setup_groups() {
  local target_app_id="${APP_ID:-<APP_ID>}"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    require_tool asc "curl -fsSL https://asccli.sh/install | bash"
    if [[ -z "$APP_ID" ]]; then
      echo "Missing --app-id <id> (or ASC_APP_ID env var) for setup-groups." >&2
      exit 1
    fi
  fi

  echo "=== Create TestFlight Internal & External Groups ==="
  run_cmd asc testflight groups create \
    --app "$target_app_id" \
    --name "$INTERNAL_GROUP" \
    --internal \
    --access-all-builds

  run_cmd asc testflight groups create \
    --app "$target_app_id" \
    --name "$EXTERNAL_GROUP" \
    --public-link-enabled \
    --public-link-limit-enabled \
    --public-link-limit 100

  echo ""
  echo "Recommended follow-ups (one-time before first external beta review):"
  echo "  asc testflight app-localizations create --app $target_app_id --locale $PRIMARY_LOCALE --description \"Ear 外语听力测试版\" --feedback-email \"you@example.com\""
  echo "  asc testflight review edit --id $target_app_id --contact-first-name \"First\" --contact-last-name \"Last\" --contact-phone \"+86...\" --contact-email \"you@example.com\" --demo-account-required=false"
  echo "  asc testflight testers add --app $target_app_id --email \"you@example.com\" --group \"$INTERNAL_GROUP\""
  echo "  gh variable set ASC_APP_ID --body \"$target_app_id\""
}

cmd_push_secrets() {
  if [[ "$DRY_RUN" -eq 0 ]]; then
    require_tool gh "install GitHub CLI"
    if [[ ! -f "$ENV_FILE" ]]; then
      echo "Env file not found: $ENV_FILE (copy .env.example to .env first)" >&2
      exit 1
    fi
    local missing=0
    for key in "${REQUIRED_SECRETS[@]}"; do
      if [[ -z "$(read_env_value "$key" "$ENV_FILE")" ]]; then
        echo "Missing required secret value in $ENV_FILE: $key" >&2
        missing=1
      fi
    done
    if [[ "$missing" -ne 0 ]]; then
      exit 1
    fi
  fi

  echo "=== Push GitHub Actions iOS Secrets & Variables ==="
  if [[ "$DRY_RUN" -eq 1 ]]; then
    for key in "${REQUIRED_SECRETS[@]}"; do
      run_cmd gh secret set "$key" --body "<from $ENV_FILE>"
    done
  else
    for key in "${REQUIRED_SECRETS[@]}"; do
      printf '%s=%s\n' "$key" "$(read_env_value "$key" "$ENV_FILE")"
    done | gh secret set -f -
  fi

  if [[ -n "$APP_ID" ]]; then
    run_cmd gh variable set ASC_APP_ID --body "$APP_ID"
    run_cmd gh variable set TESTFLIGHT_EXTERNAL_GROUP --body "$EXTERNAL_GROUP"
  else
    echo "Tip: once you have an App ID, run: gh variable set ASC_APP_ID --body \"<APP_ID>\""
  fi
}

SUBCOMMAND="${1:-}"
if [[ -z "$SUBCOMMAND" || "$SUBCOMMAND" == "-h" || "$SUBCOMMAND" == "--help" ]]; then
  usage
  exit 0
fi
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-id)
      APP_ID="${2:-}"
      shift 2
      ;;
    --env)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --apply|--execute)
      DRY_RUN=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$SUBCOMMAND" in
  check)
    cmd_check
    ;;
  init-app)
    cmd_init_app
    ;;
  setup-groups)
    cmd_setup_groups
    ;;
  push-secrets)
    cmd_push_secrets
    ;;
  *)
    echo "Unknown subcommand: $SUBCOMMAND" >&2
    usage >&2
    exit 1
    ;;
esac
