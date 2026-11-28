#!/usr/bin/env bash
# Sign an Ear.app with Developer ID, notarize the release zip, staple the ticket, and rewrite the zip.
# Requires APPLE_DEVELOPER_ID_P12_BASE64, APPLE_DEVELOPER_ID_P12_PASSWORD,
# APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_API_KEY_BASE64.
set -euo pipefail

APP=${1:?usage: macos-sign-and-notarize.sh <Ear.app> <zip>}
ZIP=${2:?usage: macos-sign-and-notarize.sh <Ear.app> <zip>}

require_secret() {
  local name=$1
  if [ -z "${!name:-}" ]; then
    echo "::error::Missing required secret: ${name}" >&2
    exit 1
  fi
}

for name in \
  APPLE_DEVELOPER_ID_P12_BASE64 \
  APPLE_DEVELOPER_ID_P12_PASSWORD \
  APP_STORE_CONNECT_KEY_ID \
  APP_STORE_CONNECT_ISSUER_ID \
  APP_STORE_CONNECT_API_KEY_BASE64
do
  require_secret "$name"
done

if [ ! -d "$APP" ]; then
  echo "::error::App bundle not found: ${APP}" >&2
  exit 1
fi

umask 077
REMOVE_WORK=false
if [ -n "${RUNNER_TEMP:-}" ]; then
  WORK=$RUNNER_TEMP
else
  WORK=$(mktemp -d)
  REMOVE_WORK=true
fi
KEYCHAIN_PATH="$WORK/app-signing.keychain-db"
KEYCHAIN_PASSWORD=$(openssl rand -hex 24)
P12="$WORK/developer-id.p12"
API_KEY="$WORK/AuthKey.p8"
CA_CER="$WORK/DeveloperIDG2CA.cer"
PREV_DEFAULT=""
EXISTING_KEYCHAINS=()

cleanup() {
  if [ -n "$PREV_DEFAULT" ]; then
    security default-keychain -s "$PREV_DEFAULT" || true
  fi
  if [ "${#EXISTING_KEYCHAINS[@]}" -gt 0 ]; then
    security list-keychains -d user -s "${EXISTING_KEYCHAINS[@]}" || true
  fi
  if [ -f "$KEYCHAIN_PATH" ] || [ -n "${KEYCHAIN_CREATED:-}" ]; then
    security delete-keychain "$KEYCHAIN_PATH" 2>/dev/null || true
  fi
  rm -f "$P12" "$API_KEY"
  if [ "$REMOVE_WORK" = true ]; then
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

printf '%s' "$APPLE_DEVELOPER_ID_P12_BASE64" | openssl base64 -d -A -out "$P12"
chmod 600 "$P12"
printf '%s' "$APP_STORE_CONNECT_API_KEY_BASE64" | openssl base64 -d -A -out "$API_KEY"
chmod 600 "$API_KEY"

# Developer ID Certification Authority (G2), intermediate for Developer ID Application certs.
EXPECTED_CA_SHA256="f16cd3c54c7f83cea4bf1a3e6a0819c8aaa8e4a1528fd144715f350643d2df3a"
curl -fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 \
  -o "$CA_CER" \
  https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
ACTUAL_CA_SHA256=$(openssl dgst -sha256 "$CA_CER" | awk '{print $NF}')
if [ "$ACTUAL_CA_SHA256" != "$EXPECTED_CA_SHA256" ]; then
  echo "::error::DeveloperIDG2CA.cer SHA-256 mismatch: expected ${EXPECTED_CA_SHA256}, got ${ACTUAL_CA_SHA256}" >&2
  exit 1
fi

PREV_DEFAULT=$(security default-keychain | tr -d '"')
PREV_DEFAULT=${PREV_DEFAULT#"${PREV_DEFAULT%%[![:space:]]*}"}
PREV_DEFAULT=${PREV_DEFAULT%"${PREV_DEFAULT##*[![:space:]]}"}
while IFS= read -r kc; do
  kc=${kc#"${kc%%[![:space:]]*}"}
  kc=${kc#\"}
  kc=${kc%\"}
  [ -n "$kc" ] && EXISTING_KEYCHAINS+=("$kc")
done < <(security list-keychains -d user)

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
KEYCHAIN_CREATED=true
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security import "$CA_CER" -k "$KEYCHAIN_PATH" -T /usr/bin/codesign -T /usr/bin/security
security import "$P12" -k "$KEYCHAIN_PATH" -P "$APPLE_DEVELOPER_ID_P12_PASSWORD" -f pkcs12 -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
if [ "${#EXISTING_KEYCHAINS[@]}" -gt 0 ]; then
  security list-keychains -d user -s "$KEYCHAIN_PATH" "${EXISTING_KEYCHAINS[@]}"
else
  security list-keychains -d user -s "$KEYCHAIN_PATH"
fi
security default-keychain -s "$KEYCHAIN_PATH"

SIGN_IDENTITY=$(security find-identity -v -p codesigning "$KEYCHAIN_PATH" | awk -F'"' '/Developer ID Application:/ { print $2; exit }')
if [ -z "$SIGN_IDENTITY" ]; then
  echo "::error::No Developer ID Application signing identity found in imported keychain" >&2
  security find-identity -v -p codesigning "$KEYCHAIN_PATH" >&2 || true
  exit 1
fi
echo "Signing with: $SIGN_IDENTITY"

sign() {
  codesign --force --options runtime --timestamp --keychain "$KEYCHAIN_PATH" --sign "$SIGN_IDENTITY" "$1"
}

# Loose Mach-O files first (deepest path first), then bundles deepest-first.
# The outer .app is a bundle, so it is sealed last and covers Helpers/ear.
macho_list=$(mktemp)
find "$APP" -type f -print0 | while IFS= read -r -d '' bin; do
  if file -b "$bin" | grep -q 'Mach-O'; then
    depth=$(awk -F/ '{print NF}' <<<"$bin")
    printf '%s\t%s\n' "$depth" "$bin"
  fi
done | sort -t $'\t' -k1,1nr | while IFS=$'\t' read -r _depth bin; do
  printf '%s\n' "$bin"
done >"$macho_list"
while IFS= read -r bin; do
  [ -n "$bin" ] && sign "$bin"
done <"$macho_list"
rm -f "$macho_list"

find "$APP" -depth -type d \( \
  -name '*.framework' -o -name '*.appex' -o -name '*.xpc' -o -name '*.bundle' -o -name '*.app' \
\) -print | while IFS= read -r bundle; do
  sign "$bundle"
done

codesign --verify --deep --strict --verbose=2 "$APP"

rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"

submit_json="$WORK/notary.json"
if ! xcrun notarytool submit "$ZIP" \
  --key "$API_KEY" \
  --key-id "$APP_STORE_CONNECT_KEY_ID" \
  --issuer "$APP_STORE_CONNECT_ISSUER_ID" \
  --wait \
  --timeout 30m \
  --no-progress \
  --output-format json >"$submit_json"
then
  submission_id=$(jq -r '.id // empty' "$submit_json" 2>/dev/null || true)
  if [ -n "$submission_id" ]; then
    xcrun notarytool log "$submission_id" \
      --key "$API_KEY" \
      --key-id "$APP_STORE_CONNECT_KEY_ID" \
      --issuer "$APP_STORE_CONNECT_ISSUER_ID" || true
  fi
  echo "::error::macOS notarization failed" >&2
  cat "$submit_json" >&2 || true
  exit 1
fi

xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
test -s "$ZIP"
echo "Notarized and stapled: $ZIP"
