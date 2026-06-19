#!/usr/bin/env bash
#
# bootstrap-internal.sh — restore the private companion repo into ./internal
#
# The public repo gitignores /internal/. The private companion
# (nodrel-dev/n8n-ups-node-internal) holds the copyrighted UPS API specs,
# the commercial build brief, and the spec-kit planning material (specs/,
# .specify/). Run this once on a fresh clone to pull that content back in.
#
# Usage:
#   ./bootstrap-internal.sh                # clone the default SSH remote
#   ./bootstrap-internal.sh <git-remote>   # override the remote (e.g. HTTPS)
#
set -euo pipefail

REMOTE="${1:-git@github.com:nodrel-dev/n8n-ups-node-internal.git}"
DEST="internal"

if [ -d "$DEST/.git" ]; then
  echo "internal/ is already a git repo — pulling latest (fast-forward only)…"
  git -C "$DEST" pull --ff-only
  echo "Done. internal/ is up to date."
  exit 0
fi

if [ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ]; then
  echo "ERROR: '$DEST/' already exists and is not a git repository." >&2
  echo "Move or remove it first, then re-run ./bootstrap-internal.sh" >&2
  exit 1
fi

echo "Cloning $REMOTE into $DEST/ …"
git clone "$REMOTE" "$DEST"
echo "Done. Private companion content restored into internal/."
