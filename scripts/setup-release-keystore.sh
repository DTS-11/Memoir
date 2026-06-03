#!/usr/bin/env bash
# One-time setup for signing Memoir release APKs.
#
# Generates a PKCS12 keystore using only openssl (no JDK required), then
# either uploads the four required GitHub Secrets via `gh secret set`, or
# writes them to github-secrets-to-upload.txt for manual paste into the
# GitHub web UI.
#
# Run from the repo root in Git Bash (Windows) or any POSIX shell:
#   bash scripts/setup-release-keystore.sh
#
# IMPORTANT: keep memoir-release.p12 + your password in a safe place.
# If you lose them you can never publish an in-place upgrade for users
# who already installed an earlier release.

set -euo pipefail

REPO="DTS-11/Memoir"
KEYSTORE="memoir-release.p12"
KEY_ALIAS="memoir"
SECRETS_FILE="github-secrets-to-upload.txt"

if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: openssl is not on PATH." >&2
  echo "On Windows, openssl ships with Git for Windows. Run this script from Git Bash." >&2
  exit 1
fi

if [ -f "$KEYSTORE" ]; then
  read -r -p "$KEYSTORE already exists. Overwrite? (y/N) " reply
  case "$reply" in
    [Yy]*) rm -f "$KEYSTORE" ;;
    *)     echo "Aborted."; exit 0 ;;
  esac
fi

echo
echo "== Memoir release keystore setup =="
echo "This will generate a self-signed keystore valid for ~27 years."
echo

while :; do
  read -r -s -p "Keystore password (min 6 chars): " STORE_PASS
  echo
  if [ ${#STORE_PASS} -lt 6 ]; then
    echo "Password too short. Try again."
    continue
  fi
  read -r -s -p "Confirm password: " STORE_PASS2
  echo
  if [ "$STORE_PASS" != "$STORE_PASS2" ]; then
    echo "Passwords do not match. Try again."
    continue
  fi
  break
done

echo
echo "Generating keystore..."

# Use a temp dir so partial output cannot leak if the script aborts.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Self-signed cert + RSA key in PEM.
openssl req -x509 -newkey rsa:2048 \
  -keyout "$TMP/key.pem" \
  -out "$TMP/cert.pem" \
  -days 10000 -nodes \
  -subj "/CN=Memoir/O=Memoir/C=XX" \
  >/dev/null 2>&1

# Bundle into a PKCS12 keystore. Android Gradle Plugin 8+ accepts PKCS12.
openssl pkcs12 -export \
  -in "$TMP/cert.pem" \
  -inkey "$TMP/key.pem" \
  -name "$KEY_ALIAS" \
  -out "$KEYSTORE" \
  -passout pass:"$STORE_PASS"

echo "Keystore written to $(pwd)/$KEYSTORE"
echo

# Sanity check: openssl can read the keystore back with the same password.
if ! openssl pkcs12 -in "$KEYSTORE" -passin pass:"$STORE_PASS" -nokeys -nocerts -noout >/dev/null 2>&1; then
  echo "Error: could not verify the generated keystore. Aborting." >&2
  exit 1
fi

# Show certificate fingerprint so the user knows what they just made.
FP=$(openssl pkcs12 -in "$KEYSTORE" -passin pass:"$STORE_PASS" -nokeys 2>/dev/null \
       | openssl x509 -noout -fingerprint -sha256 \
       | sed 's/^.*=//')
echo "Certificate SHA-256 fingerprint:"
echo "  $FP"
echo "(This identity must stay the same for all future releases.)"
echo

# Base64-encode for the GitHub Secret.
if base64 --help 2>&1 | grep -q -- '-w'; then
  B64=$(base64 -w0 "$KEYSTORE")
else
  # macOS / BSD base64
  B64=$(base64 < "$KEYSTORE" | tr -d '\n')
fi

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI detected and authenticated. Uploading secrets to $REPO ..."
  printf '%s' "$B64"          | gh secret set ANDROID_KEYSTORE_BASE64    -R "$REPO"
  printf '%s' "$STORE_PASS"   | gh secret set ANDROID_KEYSTORE_PASSWORD  -R "$REPO"
  printf '%s' "$KEY_ALIAS"    | gh secret set ANDROID_KEY_ALIAS          -R "$REPO"
  printf '%s' "$STORE_PASS"   | gh secret set ANDROID_KEY_PASSWORD       -R "$REPO"
  echo
  echo "All four GitHub Secrets are set on $REPO."
  echo
  echo "Verify with:  gh secret list -R $REPO"
  rm -f "$SECRETS_FILE"
else
  cat > "$SECRETS_FILE" <<EOF
Upload these four GitHub Secrets at:
  https://github.com/$REPO/settings/secrets/actions

----------------------------------------------------------------
ANDROID_KEYSTORE_BASE64
----------------------------------------------------------------
$B64

----------------------------------------------------------------
ANDROID_KEYSTORE_PASSWORD
----------------------------------------------------------------
(paste the keystore password you typed in the terminal)

----------------------------------------------------------------
ANDROID_KEY_ALIAS
----------------------------------------------------------------
$KEY_ALIAS

----------------------------------------------------------------
ANDROID_KEY_PASSWORD
----------------------------------------------------------------
(paste the same keystore password again)
EOF
  echo "GitHub CLI not found (or not authenticated)."
  echo "Wrote paste-ready values to: $SECRETS_FILE"
  echo
  echo "Open the file, copy each value into the matching secret on GitHub,"
  echo "then delete the file. (It is gitignored and never contains your password.)"
fi

echo
echo "== Next steps =="
echo "1. Back up $KEYSTORE and the password to a password manager."
echo "2. Verify the four secrets exist on GitHub."
echo "3. Tag and push a release:  git tag v0.1.0 && git push origin v0.1.0"
echo
