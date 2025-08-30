#!/usr/bin/env bash
set -euo pipefail

# Provided by certbot:
#   $CERTBOT_DOMAIN      e.g. example.com or home.example.com
#   $CERTBOT_VALIDATION  the TXT value to set

echo "Auth hook called for $CERTBOT_DOMAIN" >&2
echo "Validation string: $CERTBOT_VALIDATION" >&2

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Prefer compiled JS if present; otherwise use ts-node
if [[ -f "$SCRIPT_DIR/dist/dns-auth-hook.js" ]]; then
  node "$SCRIPT_DIR/dist/dns-auth-hook.js" "$CERTBOT_DOMAIN" "$CERTBOT_VALIDATION"
else
  npx ts-node "$SCRIPT_DIR/src/dns-auth-hook.ts" "$CERTBOT_DOMAIN" "$CERTBOT_VALIDATION"
fi
