#!/usr/bin/env bash
#
# harness.sh — boot a real n8n in Docker with this package installed, for
# dual-path testing (normal node path AND AI-Agent tool path).
#
# The headless chat webhook is unreliable for tool-path testing; drive
# workflows headlessly instead with:  n8n execute --id <workflowId>
# on a separate broker port. (gotchas §9)
#
# Usage: ./scripts/harness.sh        # interactive, opens http://localhost:5678
#        ./scripts/harness.sh --ci   # build, install, execute saved test workflows, exit

set -euo pipefail

PKG_NAME="$(node -p "require('./package.json').name")"
PORT="${N8N_PORT:-5678}"

echo "==> Building $PKG_NAME"
npm run build
npm pack
TARBALL="$(ls -t ./*.tgz | head -n1)"

echo "==> Starting n8n (Docker) with $PKG_NAME installed on :$PORT"
docker run --rm -it \
  -p "${PORT}:5678" \
  -e N8N_RUNNERS_ENABLED=true \
  -e N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true \
  -v "$(pwd)/$TARBALL:/tmp/$TARBALL" \
  --entrypoint /bin/sh \
  docker.n8n.io/n8nio/n8n \
  -c "cd /home/node/.n8n && npm install /tmp/$TARBALL && n8n start"

# For --ci: install the tarball, import test/workflows/*.json, then
# `n8n execute --id <id>` each and assert on output. Wire to your fixtures.
