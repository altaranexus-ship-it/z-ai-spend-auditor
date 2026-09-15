#!/usr/bin/env bash
# CLAW-48 post-key finish chain — ONE command after the owner hands off the key.
# Usage: T3N_API_KEY=0x... T3N_DID=did:t3n:... ./scripts/run-finish.sh [--with-agent-did]
set -euo pipefail
: "${T3N_API_KEY:?T3N_API_KEY must be set (0x... key from go.terminal3.io/adk-community)}"
: "${T3N_DID:?T3N_DID must be set (did:t3n:... from the claim page)}"

# macOS: Paperclip run TMPDIR paths exceed the 104-char unix-socket limit and
# crash tsx IPC ("listen ... .pipe"). Pin a short TMPDIR — verified 09-14.
export TMPDIR="${TMPDIR_OVERRIDE:-/tmp/tsx48}"
mkdir -p "$TMPDIR"

cd "$(dirname "$0")/.."

echo "== [1/3] setup: tenant connect =="
npx tsx scripts/session.ts

echo "== [2/3] demo: end-to-end evidence =="
npx tsx scripts/demo.ts

if [[ "${1:-}" == "--with-agent-did" ]]; then
  echo "== [2.5] register-agent: agent DID + ERC-8004 card =="
  # Optional enhancement — needs a dedicated AGENT_KEY (separate claim-page
  # visit). Missing key or CLI failure must not kill the finish chain.
  npx tsx scripts/register-agent.ts || \
    echo "register-agent skipped (AGENT_KEY absent or CLI error) — agent DID is optional for submission"
fi

echo "== [3/3] chain complete. Copy the 'Connected as:' DID into SUBMISSION_KIT.md, then Earn submit. =="
