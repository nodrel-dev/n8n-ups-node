#!/usr/bin/env bash
#
# harness-up.sh — one-command dual-path test harness for the UPS node.
#
# Unlike harness.sh (interactive, hand-import), this script does the wiring FOR you:
#   1. builds + packs the node and installs the tarball into a fresh n8n (Docker, detached)
#   2. SEEDS the UPS OAuth2 credential from .env.local (no hand-typing in the UI)
#   3. IMPORTS all six test/workflows/*.json with that credential pre-attached
#   4. (optional) RUNS gates 1–5 headlessly and prints each result
#
# Driving workflows headlessly with `n8n execute --id` is the reliable path; the
# headless chat webhook is flaky for the tool path (gotchas §9).
#
# Usage:
#   ./scripts/harness-up.sh up      # build, boot, seed cred, import all workflows  (default)
#   ./scripts/harness-up.sh run     # execute gates 1–5 headlessly, print results
#   ./scripts/harness-up.sh ids     # list imported workflows + their ids
#   ./scripts/harness-up.sh logs    # follow n8n container logs
#   ./scripts/harness-up.sh down    # stop + remove the harness container
#
# Gate 5 (06-agent-track.json) is the AI-Agent TOOL path — it needs an Anthropic
# credential and an interactive chat, so run it from the UI (see RUN output).

set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER="n8n-ups-harness"
PORT="${N8N_PORT:-5678}"
IMAGE="docker.n8n.io/n8nio/n8n"
ENC_KEY="ups-harness-fixed-key-do-not-use-in-prod"
CRED_ID="ups-cie-cred"
CRED_NAME="UPS CIE"

# Permanent n8n owner login auto-created on every `up` so you never hit the setup wizard.
# (n8n password rule: 8–64 chars, ≥1 number, ≥1 capital.)
OWNER_EMAIL="ups-harness@local.test"
OWNER_PASSWORD="UpsHarness2026!"
OWNER_FIRST="UPS"
OWNER_LAST="Harness"
STAGE=".harness-stage/import"
PKG_NAME="$(node -p "require('./package.json').name")"   # @nodrel-dev/n8n-nodes-ups

# --- read a key from .env.local (value after first =; strips quotes, CR, a trailing " # comment",
#     and surrounding whitespace). Safe for typical alphanumeric secrets. ---------------------
read_env() {
  [ -f .env.local ] || return 0
  awk -F= -v k="$1" '$1==k{
    sub(/^[^=]*=/,""); gsub(/\r|"/,""); sub(/[ \t]+#.*$/,"");
    gsub(/^[ \t]+|[ \t]+$/,""); print; exit
  }' .env.local
}

cmd_up() {
  echo "==> Building $PKG_NAME"
  npm run build
  npm pack >/dev/null
  TARBALL="$(ls -t ./*.tgz | head -n1)"
  echo "    packed: $TARBALL"

  # --- pull secrets (supports the scaffold's __SERVICE__* names and plain UPS_* names) -------
  local CLIENT_ID CLIENT_SECRET ENVIRONMENT
  CLIENT_ID="$(read_env __SERVICE___CLIENT_ID)";       [ -n "$CLIENT_ID" ]     || CLIENT_ID="$(read_env UPS_CLIENT_ID)"
  CLIENT_SECRET="$(read_env __SERVICE___CLIENT_SECRET)";[ -n "$CLIENT_SECRET" ] || CLIENT_SECRET="$(read_env UPS_CLIENT_SECRET)"
  ENVIRONMENT="$(read_env __SERVICE___ENV)";            [ -n "$ENVIRONMENT" ]   || ENVIRONMENT="sandbox"
  case "$ENVIRONMENT" in production) ENVIRONMENT=production;; *) ENVIRONMENT=sandbox;; esac

  if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
    echo "!!  No UPS client id/secret found in .env.local — the credential will be seeded EMPTY."
    echo "!!  Fill __SERVICE___CLIENT_ID / __SERVICE___CLIENT_SECRET, or add them in the UI after boot."
  else
    echo "    seeding credential from .env.local (environment: $ENVIRONMENT)"
  fi

  # --- stage credential + credential-wired workflows (gitignored dir) ------------------------
  rm -rf "$STAGE"; mkdir -p "$STAGE"
  cat > "$STAGE/cred.json" <<JSON
[
  {
    "id": "$CRED_ID",
    "name": "$CRED_NAME",
    "type": "upsOAuth2Api",
    "data": {
      "grantType": "clientCredentials",
      "environment": "$ENVIRONMENT",
      "clientId": "$CLIENT_ID",
      "clientSecret": "$CLIENT_SECRET",
      "authentication": "header"
    }
  }
]
JSON
  # Stage each workflow: attach the seeded credential id AND inject a top-level `id`
  # (n8n's `import:workflow` CLI requires a non-null id — our fixtures omit it).
  for f in test/workflows/0[1-6]-*.json; do
    local base; base="$(basename "$f" .json)"
    node -e '
      const fs = require("fs");
      const [file, out, credId, wfId] = process.argv.slice(1);
      const wf = JSON.parse(fs.readFileSync(file, "utf8"));
      wf.id = wfId;
      for (const n of wf.nodes || []) {
        for (const c of Object.values(n.credentials || {})) {
          if (c && c.id === "REPLACE_WITH_YOUR_CREDENTIAL_ID") c.id = credId;
        }
      }
      fs.writeFileSync(out, JSON.stringify(wf, null, 2));
    ' "$f" "$STAGE/$base.json" "$CRED_ID" "ups-$base"
  done

  echo "==> (Re)starting $CONTAINER on :$PORT"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" \
    -p "${PORT}:5678" \
    -e N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true \
    -e N8N_SECURE_COOKIE=false \
    -e N8N_ENCRYPTION_KEY="$ENC_KEY" \
    -e N8N_RUNNERS_ENABLED=true \
    -v "$(pwd)/$TARBALL:/tmp/pkg.tgz" \
    -v "$(pwd)/$STAGE:/stage" \
    --entrypoint /bin/sh \
    "$IMAGE" \
    -c "mkdir -p /home/node/.n8n/nodes && cd /home/node/.n8n/nodes && npm install /tmp/pkg.tgz >/tmp/inst.log 2>&1 && cd /home/node/.n8n && n8n start" \
    >/dev/null
  echo "    container started; installing node + booting n8n…"

  # --- wait for the REST API to answer -------------------------------------------------------
  printf "    waiting for n8n"
  for _ in $(seq 1 60); do
    if curl -fs "http://localhost:${PORT}/healthz" >/dev/null 2>&1; then echo " — ready"; break; fi
    printf "."; sleep 2
  done

  echo "==> Creating owner login ($OWNER_EMAIL)"
  # Same endpoint the n8n setup wizard posts to (works only while no owner exists). The route can
  # 404 briefly after healthz first reports ok — DB migrations / route registration are still
  # finishing — so retry until it's created (200) or already exists (400/409).
  local code=000
  for _ in $(seq 1 15); do
    code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:${PORT}/rest/owner/setup" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"$OWNER_EMAIL\",\"firstName\":\"$OWNER_FIRST\",\"lastName\":\"$OWNER_LAST\",\"password\":\"$OWNER_PASSWORD\"}" || echo 000)"
    case "$code" in
      200)     echo "    owner created — login ready"; break ;;
      400|409) echo "    owner already exists — login ready"; break ;;
      *)       sleep 2 ;;
    esac
  done
  case "$code" in 200|400|409) ;; *) echo "    owner setup still HTTP $code — create it once in the UI, or re-run 'up'." ;; esac

  echo "==> Seeding credential"
  docker exec "$CONTAINER" n8n import:credentials --input=/stage/cred.json

  echo "==> Importing workflows"
  for f in "$STAGE"/0[1-6]-*.json; do
    docker exec "$CONTAINER" n8n import:workflow --input="/stage/$(basename "$f")" || true
  done

  # secrets only needed during import — remove the plaintext credential file from disk
  rm -f "$STAGE/cred.json"

  echo
  echo "==> Done. Open http://localhost:${PORT}"
  echo "    Login:  $OWNER_EMAIL  /  $OWNER_PASSWORD"
  echo "    (UPS credential 'UPS CIE' is pre-attached on every workflow)"
  echo "    Headless smoke test of gates 1–5:  ./scripts/harness-up.sh run"
  echo "    Gate 5 (AI-Agent tool path) is interactive — see that workflow in the UI; add an Anthropic credential, click 'Open Chat'."
  cmd_ids
}

cmd_ids() {
  echo "==> Workflows:"
  docker exec "$CONTAINER" n8n list:workflow 2>/dev/null || echo "   (container not running — run 'up' first)"
}

# Execute one workflow by matching a substring of its name; print the run outcome.
_run_one() {
  local match="$1" label="$2" id
  id="$(docker exec "$CONTAINER" n8n list:workflow 2>/dev/null | grep -i "$match" | head -1 | cut -d'|' -f1)"
  if [ -z "$id" ]; then echo "  [skip] $label — not found"; return; fi
  echo "  ── $label  (id $id) ─────────────────────────────"
  # `n8n execute` spins its own task-broker; give it a free port so it can't clash with the
  # running instance's broker on 5679 (gotchas §9 — "a separate broker port").
  docker exec \
    -e N8N_RUNNERS_BROKER_PORT=5681 \
    -e N8N_RUNNERS_BROKER_LISTEN_ADDRESS=127.0.0.1 \
    "$CONTAINER" n8n execute --id "$id" 2>&1 \
    | grep -iE '"status"|"finished"|tracking|resolution|serviceName|totalCharges|"code"|NodeApiError|NodeOperationError|error' \
    | head -n 20 \
    || echo "  (execution failed — see output above)"
  echo
}

cmd_run() {
  echo "==> Running gates 1–5 headlessly (gate 5 chat path excluded — run it in the UI)"
  _run_one "Track"               "Gate 1 · Track"
  _run_one "Validate"            "Gate 2 · Validate Address"
  _run_one "Get Rates"           "Gate 3 · Get Rates"
  _run_one "domestic"            "Gate 4a · Create domestic"
  _run_one "international"        "Gate 4b · Create international"
}

case "${1:-up}" in
  up)   cmd_up ;;
  run)  cmd_run ;;
  ids)  cmd_ids ;;
  logs) docker logs -f "$CONTAINER" ;;
  down) docker rm -f "$CONTAINER" >/dev/null 2>&1 && echo "removed $CONTAINER" || echo "nothing to remove" ;;
  *)    echo "usage: $0 {up|run|ids|logs|down}"; exit 1 ;;
esac
