#!/usr/bin/env bash
# Hermetic coverage for macOS Developer ID signing: no Apple account, keychain, or network.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Developer ID Certification Authority (G2), DER. Hash is pinned in macos-sign-and-notarize.sh.
cat >"$tmp/ca.b64" <<'B64'
MIIEPjCCAyagAwIBAgIUf7QAP82XSXrLg02SpIp4c8KEXUMwDQYJKoZIhvcNAQELBQAwYjELMAkGA1UEBhMCVVMxEzARBgNVBAoTCkFwcGxlIEluYy4xJjAkBgNVBAsTHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRYwFAYDVQQDEw1BcHBsZSBSb290IENBMB4XDTIxMDkyMjE4NTUxMFoXDTMxMDkxNzAwMDAwMFowXjEtMCsGA1UEAwwkRGV2ZWxvcGVyIElEIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MQswCQYDVQQLDAJHMjETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDTLJVoIVSRir9lccIYTvbNDeGRKHXXA7qVH9MSmVJE3oBGZ/wpiwCFiIowh01Mbkq0x+UC49djTKrM6uzbQi+RfSXpX6RLKlRvF6wwnykoNKR/j+V4410jKiFG0InDX/hql51xGxiosgzJAwo1sgKnLfWz3BuDxSchQHKm5zd2Mee7Br90svZwrEysLc3JXkWLz/sI5mLVQJW1N1zMGw7h79yl5Y3JULdAnwojJUVAj5Rne+CU6jnTeKU00cLL4DN/LrYsw+Um1SXOqo0qd/yeFJaX4PVfLvLop3GnO6OZTHoio03vcBHV1oaBgvFnM5MzWkCxksSqc5YdxFz/4es3AgMBAAGjge8wgewwEgYDVR0TAQH/BAgwBgEB/wIBADAfBgNVHSMEGDAWgBQr0GlHlHYJ/vRrjS5ApvdHTX8IXjBEBggrBgEFBQcBAQQ4MDYwNAYIKwYBBQUHMAGGKGh0dHA6Ly9vY3NwLmFwcGxlLmNvbS9vY3NwMDMtYXBwbGVyb290Y2EwLgYDVR0fBCcwJTAjoCGgH4YdaHR0cDovL2NybC5hcHBsZS5jb20vcm9vdC5jcmwwHQYDVR0OBBYEFPg6DGkRduDtrNHrpln6N9XEVbAeMA4GA1UdDwEB/wQEAwIBBjAQBgoqhkiG92NkBgIGBAIFADANBgkqhkiG9w0BAQsFAAOCAQEAwf1DClm/8bG3QxBa1hgyMBRWJuERSGMraXKXSB+OW8peJhX7dCOAM1QzGaEihlrYuEtpqqfOlpbCCsc1atBvzoppg2JtSjn1/oNN16LUiB/tiMAP+PkzHrQQt8JcETdENwSwpESdjGgNe30dfsy1k/DWbz0VeoCldNPhj33SiOgxp5jFH9/iglmugIFgRhbsnrmKQKobKuFhhgqMcA/ZSizsTKIFEdZ5jKVjJSEjAm+TW1pXoddFbd/M93+fX9vH7WSnb0Qvb009eHgKVrQ71zrIK2Wik+rbWOqO1LnEwDD8MhpNupIMJDmYgjqgmd7n5OS8DryFr1qrXND828wQww==
B64

mkdir -p "$tmp/bin"
cat >"$tmp/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then out=$arg; fi
  prev=$arg
done
[ -n "$out" ]
if [ "${CA_BAD:-false}" = true ]; then
  printf 'not a certificate' >"$out"
else
  openssl base64 -d -A -out "$out" <"$CA_B64"
fi
MOCK
cat >"$tmp/bin/security" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf 'security %s\n' "$*" >>"$TRACE"
cmd=$1
shift
case "$cmd" in
  default-keychain)
    if [ "${1:-}" = "-s" ]; then exit 0; fi
    printf '%s\n' '"login.keychain-db"'
    ;;
  list-keychains)
    if [ "${1:-}" = "-d" ] && [ "${3:-}" = "-s" ]; then exit 0; fi
    printf '%s\n' '"/Library/Keychains/System.keychain"'
    ;;
  find-identity)
    if [ "${EMPTY_IDENTITY:-false}" = true ]; then
      printf '%s\n' '     0 valid identities found'
      exit 0
    fi
    printf '%s\n' '  1) DEADBEEF "Developer ID Application: Ear Test (TEAMID)"'
    ;;
  *) exit 0 ;;
esac
MOCK
cat >"$tmp/bin/codesign" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf 'codesign %s\n' "$*" >>"$TRACE"
MOCK
cat >"$tmp/bin/file" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' 'Mach-O 64-bit executable arm64'
MOCK
cat >"$tmp/bin/ditto" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf 'ditto %s\n' "$*" >>"$TRACE"
prev=""
dest=""
for arg in "$@"; do
  dest=$arg
  prev=$arg
done
: "$prev"
printf 'zip\n' >"$dest"
MOCK
cat >"$tmp/bin/xcrun" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf 'xcrun %s\n' "$*" >>"$TRACE"
if [ "$1" = notarytool ] && [ "$2" = submit ]; then
  printf '%s\n' '{"id":"sub-1","status":"Invalid"}'
  if [ "${NOTARY_FAIL:-false}" = true ]; then exit 1; fi
fi
exit 0
MOCK
chmod +x "$tmp/bin/"*

app="$tmp/Ear.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Helpers" "$app/Contents/Frameworks/Foo.framework/Versions/A"
printf 'main\n' >"$app/Contents/MacOS/Ear"
printf 'helper\n' >"$app/Contents/Helpers/ear"
printf 'foo\n' >"$app/Contents/Frameworks/Foo.framework/Versions/A/Foo"
zip="$tmp/Ear-macos.zip"

run_sign() {
  env -i \
    PATH="$tmp/bin:/usr/bin:/bin" \
    HOME="${HOME:-/tmp}" \
    TRACE="$TRACE" \
    CA_B64="$tmp/ca.b64" \
    RUNNER_TEMP="$tmp/runner" \
    APPLE_DEVELOPER_ID_P12_BASE64="$(printf 'test-p12' | openssl base64 -A)" \
    APPLE_DEVELOPER_ID_P12_PASSWORD=secret \
    APP_STORE_CONNECT_KEY_ID=KEYID123456 \
    APP_STORE_CONNECT_ISSUER_ID=00000000-0000-0000-0000-000000000000 \
    APP_STORE_CONNECT_API_KEY_BASE64="$(printf 'test-key' | openssl base64 -A)" \
    CA_BAD="${CA_BAD:-false}" \
    EMPTY_IDENTITY="${EMPTY_IDENTITY:-false}" \
    NOTARY_FAIL="${NOTARY_FAIL:-false}" \
    bash "$root/scripts/macos-sign-and-notarize.sh" "$app" "$zip"
}

if env -i PATH="$PATH" HOME="${HOME:-/tmp}" bash "$root/scripts/macos-sign-and-notarize.sh" "$app" "$zip" >/dev/null 2>"$tmp/missing.err"; then
  echo "Expected missing secrets to fail" >&2
  exit 1
fi
grep -q 'APPLE_DEVELOPER_ID_P12_BASE64' "$tmp/missing.err"

mkdir -p "$tmp/runner"
TRACE="$tmp/trace"
: >"$TRACE"
run_sign
helper_at=$(grep -n 'codesign --force .*Contents/Helpers/ear$' "$TRACE" | head -1 | cut -d: -f1)
app_at=$(grep -n 'codesign --force .*Ear.app$' "$TRACE" | head -1 | cut -d: -f1)
foo_bin_at=$(grep -n 'codesign --force .*Foo.framework/Versions/A/Foo$' "$TRACE" | head -1 | cut -d: -f1)
foo_fw_at=$(grep -n 'codesign --force .*Foo.framework$' "$TRACE" | head -1 | cut -d: -f1)
[ -n "$helper_at" ] && [ -n "$app_at" ] && [ "$helper_at" -lt "$app_at" ]
[ -n "$foo_bin_at" ] && [ -n "$foo_fw_at" ] && [ "$foo_bin_at" -lt "$foo_fw_at" ]
[ "$foo_fw_at" -lt "$app_at" ]
grep -q 'codesign --verify --deep --strict' "$TRACE"
grep -q 'Developer ID Application: Ear Test (TEAMID)' "$TRACE"
ditto_n=$(grep -c '^ditto ' "$TRACE")
[ "$ditto_n" -eq 2 ]
notary_at=$(grep -n '^xcrun notarytool submit ' "$TRACE" | head -1 | cut -d: -f1)
staple_at=$(grep -n '^xcrun stapler staple ' "$TRACE" | head -1 | cut -d: -f1)
[ -n "$notary_at" ] && [ -n "$staple_at" ] && [ "$notary_at" -lt "$staple_at" ]
second_ditto=$(grep -n '^ditto ' "$TRACE" | tail -1 | cut -d: -f1)
[ "$staple_at" -lt "$second_ditto" ]
grep -q 'security delete-keychain ' "$TRACE"
[ ! -f "$tmp/runner/developer-id.p12" ]
[ ! -f "$tmp/runner/AuthKey.p8" ]
[ -s "$zip" ]

: >"$TRACE"
if NOTARY_FAIL=true run_sign >/dev/null 2>"$tmp/notary.err"; then
  echo "Expected notarization failure to fail the script" >&2
  exit 1
fi
grep -q 'macOS notarization failed' "$tmp/notary.err"
grep -q '^xcrun notarytool log sub-1 ' "$TRACE"
if grep -q '^xcrun stapler ' "$TRACE"; then
  echo "Staple ran after a rejected notarization" >&2
  exit 1
fi
grep -q 'security delete-keychain ' "$TRACE"

: >"$TRACE"
if EMPTY_IDENTITY=true run_sign >/dev/null 2>"$tmp/identity.err"; then
  echo "Expected a missing Developer ID identity to fail" >&2
  exit 1
fi
grep -q 'No Developer ID Application' "$tmp/identity.err"
if grep -q '^codesign ' "$TRACE"; then
  echo "codesign ran without a Developer ID identity" >&2
  exit 1
fi

: >"$TRACE"
if CA_BAD=true run_sign >/dev/null 2>"$tmp/ca.err"; then
  echo "Expected a CA hash mismatch to fail" >&2
  exit 1
fi
grep -q 'DeveloperIDG2CA.cer SHA-256 mismatch' "$tmp/ca.err"
if grep -q 'security import ' "$TRACE"; then
  echo "Imported a certificate after a CA hash mismatch" >&2
  exit 1
fi

printf 'macOS sign and notarize regressions passed.\n'
