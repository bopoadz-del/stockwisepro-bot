#!/usr/bin/env bash
#
# Configure Ollama env vars on the Render service and trigger a deploy.
#
# Run this from a machine with normal internet access (NOT from the sandbox,
# whose egress policy blocks api.render.com). It reads secrets from the
# environment — nothing sensitive is stored in the repo.
#
# Usage:
#   export RENDER_API_KEY="rnd_xxx"
#   export OLLAMA_API_KEY="xxxxxxxx.yyyyyyyy"
#   # optional overrides:
#   export OLLAMA_URL="https://ollama.com"      # default
#   export OLLAMA_MODEL="gpt-oss:120b"          # default — set to a model your account has
#   export SERVICE_NAME="stockwisepro-bot"      # default
#   bash deploy/set-ollama-env.sh
#
set -euo pipefail

: "${RENDER_API_KEY:?Set RENDER_API_KEY (Render → Account Settings → API Keys)}"
: "${OLLAMA_API_KEY:?Set OLLAMA_API_KEY (your Ollama Cloud key)}"
OLLAMA_URL="${OLLAMA_URL:-https://ollama.com}"
OLLAMA_MODEL="${OLLAMA_MODEL:-gpt-oss:120b}"
SERVICE_NAME="${SERVICE_NAME:-stockwisepro-bot}"
API="https://api.render.com/v1"
AUTH=(-H "Authorization: Bearer ${RENDER_API_KEY}")

echo "→ Looking up service '${SERVICE_NAME}'…"
SID="$(curl -fsS "${AUTH[@]}" -H "Accept: application/json" "${API}/services?limit=100" \
  | python3 -c "import sys,json,os
name=os.environ['SERVICE_NAME']
for s in json.load(sys.stdin):
    svc=s.get('service',s)
    if svc.get('name')==name:
        print(svc['id']); break")"

if [ -z "${SID:-}" ]; then
  echo "✗ Could not find a service named '${SERVICE_NAME}'. List them with:"
  echo "  curl -s ${API}/services -H \"Authorization: Bearer \$RENDER_API_KEY\""
  exit 1
fi
echo "  service id: ${SID}"

set_var() {
  local key="$1" val="$2"
  curl -fsS -X PUT "${API}/services/${SID}/env-vars/${key}" \
    "${AUTH[@]}" -H "Content-Type: application/json" \
    -d "$(python3 -c "import json,sys;print(json.dumps({'value':sys.argv[1]}))" "$val")" \
    -o /dev/null -w "  set ${key} -> HTTP %{http_code}\n"
}

echo "→ Setting env vars…"
set_var OLLAMA_URL     "${OLLAMA_URL}"
set_var OLLAMA_MODEL   "${OLLAMA_MODEL}"
set_var OLLAMA_API_KEY "${OLLAMA_API_KEY}"

echo "→ Triggering deploy…"
curl -fsS -X POST "${API}/services/${SID}/deploys" \
  "${AUTH[@]}" -H "Content-Type: application/json" -d '{}' \
  -o /dev/null -w "  deploy -> HTTP %{http_code}\n"

echo "✓ Done. Watch the deploy in the Render dashboard, then try /explain AAPL."
echo "  Tip: list your Ollama Cloud models with:"
echo "    curl -s https://ollama.com/api/tags -H \"Authorization: Bearer \$OLLAMA_API_KEY\""
