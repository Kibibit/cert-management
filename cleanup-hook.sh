#!/bin/sh
# This script is called by certbot after the challenge is complete
# Environment variables provided by certbot:
# - CERTBOT_DOMAIN: The domain being authenticated
# - CERTBOT_VALIDATION: The validation string
# - CERTBOT_TOKEN: Resource name part of the HTTP-01 challenge

# Log to stderr for certbot to capture
echo "Cleanup hook called for $CERTBOT_DOMAIN" >&2

# Remove the challenge file
rm -f /tmp/certbot-dns-challenge

# Exit successfully
exit 0


