#!/usr/bin/env bash
# Fake a FreJun webhook against the local dev server.
#
# Lets you exercise the whole receive path — signature verification, status
# mapping, CallLog update and timeline comment — without a FreJun account.
# The signature is a plain HMAC-SHA256, so we can compute it ourselves.
#
# Usage:
#   ./scripts/test-frejun-webhook.sh <callLogId> [status] [durationMs]
#
#   ./scripts/test-frejun-webhook.sh abc123                       # completed, 65s
#   ./scripts/test-frejun-webhook.sh abc123 "Call busy" 0
#   ./scripts/test-frejun-webhook.sh abc123 "Call answered" 0     # non-terminal
#
# Run it TWICE with the same id: the second must not create a second comment.
# That is the idempotency guard, and it is the thing most worth testing.
set -euo pipefail

cd "$(dirname "$0")/.."

CALL_LOG_ID="${1:-}"
STATUS="${2:-Call completed}"
DURATION_MS="${3:-65000}"

if [ -z "$CALL_LOG_ID" ]; then
  echo "usage: $0 <callLogId> [status] [durationMs]" >&2
  echo >&2
  echo "Find a callLogId by clicking Call on a lead, then:" >&2
  echo "  npx prisma studio    # CallLog table" >&2
  exit 1
fi

# Read config from .env WITHOUT sourcing it. Sourcing runs the file as shell,
# so a secret containing '$' (FreJun's PBKDF2-style values do) gets expanded as
# a variable — or aborts under `set -u`. Parse the literal text instead.
# Strips surrounding quotes, then unescapes \$ — dotenv expands $VAR even inside
# quotes, so values containing '$' are stored backslash-escaped in .env and must
# be unescaped here to match what the server actually loaded.
read_env() {
  sed -n "s/^[[:space:]]*$1=//p" ./.env | tail -1 \
    | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/" -e 's/\\\$/$/g'
}

SECRET="$(read_env FREJUN_CLIENT_SECRET)"
URL="$(read_env FREJUN_WEBHOOK_URL)"
URL="${URL:-http://localhost:3000/api/voice/webhook}"

if [ -z "$SECRET" ]; then
  echo "FREJUN_CLIENT_SECRET is not set in .env — the server rejects every" >&2
  echo "webhook as unverifiable. Set it (any value locally) and restart." >&2
  exit 1
fi

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Mirrors the documented call.status payload. transaction_id is what we send as
# callLogId on create-call, so the server can correlate before it has a call_id.
BODY=$(cat <<JSON
{"event":"call.status","call_id":"test-${CALL_LOG_ID}","start_time":"${NOW}","call_creator":"local@test","candidate_number":"+919650875501","virtual_number":"+911140000000","call_status":"${STATUS}","call_type":"outbound","org_identifier":"local","candidate_name":"Local Test","end_time":"${NOW}","duration":${DURATION_MS},"answer_time":"${NOW}","metadata":{"reference_id":"","job_id":"","transaction_id":"${CALL_LOG_ID}"}}
JSON
)
BODY=$(echo "$BODY" | tr -d '\n')

# frejun-signature = base64(HMAC-SHA256(method + uri + rawBody))
SIG=$(printf '%s' "POST${URL}${BODY}" \
  | openssl dgst -sha256 -hmac "$SECRET" -binary \
  | openssl base64 -A)

echo "→ POST $URL"
echo "  status:   $STATUS"
echo "  duration: ${DURATION_MS}ms"
echo

HTTP=$(curl -s -o /tmp/frejun-webhook-resp.txt -w "%{http_code}" \
  -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "frejun-signature: ${SIG}" \
  --data-raw "$BODY")

echo "← HTTP $HTTP"
cat /tmp/frejun-webhook-resp.txt; echo

case "$HTTP" in
  200) echo "✓ Accepted. Refresh the lead page." ;;
  401) echo "✗ Signature rejected. Either FREJUN_CLIENT_SECRET differs from the"
       echo "  running server's (restart it after editing .env), or"
       echo "  FREJUN_WEBHOOK_URL does not match the URL posted to." ;;
  *)   echo "✗ Unexpected. Check the dev server log." ;;
esac
