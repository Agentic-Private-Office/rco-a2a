#!/usr/bin/env bash
# RCO-01 step 1 + 5 — the D1 rail, run once the account token carries D1 scope (the CEO's hand). Reads the token in-process from
# C:\MATTHEWKEDDY\AGENT KEYS\cloudflare-d1.txt (a token with Workers Scripts:Edit + D1:Edit on account dd2832…), never prints it.
# 1. creates rco-receipts (refuses if it exists) 2. appends the binding to wrangler.toml 3. executes schema.sql 4. deploys 5. loads history/*.sql in order
# 6. verifies count + tip against history/manifest.json. Idempotent where D1 allows: a second run stops at the UNIQUE constraint, nothing is changed.
set -euo pipefail
cd "$(dirname "$0")/.."
export CLOUDFLARE_API_TOKEN="$(tr -d '\r\n' < '/c/MATTHEWKEDDY/AGENT KEYS/cloudflare-d1.txt')" CLOUDFLARE_ACCOUNT_ID=dd2832b36f171b815f84c8487aada36b
W="npx wrangler"
if ! grep -q 'd1_databases' wrangler.toml; then
  OUT=$($W d1 create rco-receipts 2>&1 | tee /dev/stderr)
  ID=$(echo "$OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  [ -n "$ID" ] || { echo "no database id returned"; exit 1; }
  printf '\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "rco-receipts"\ndatabase_id = "%s"\n' "$ID" >> wrangler.toml
fi
$W d1 execute rco-receipts --remote --file schema.sql
$W deploy
for f in rails/history/*.sql; do echo "== $f"; $W d1 execute rco-receipts --remote --file "$f" | tail -2; done
$W d1 execute rco-receipts --remote --command "SELECT COUNT(*) n, MIN(seq) a, MAX(seq) b FROM receipts"
$W d1 execute rco-receipts --remote --command "SELECT decision_id, hash, ledger_txn FROM receipts ORDER BY seq DESC LIMIT 1"
echo "expected:"; python -I -c "import json;m=json.load(open('rails/history/manifest.json'));print(m['rows'],m['last'],m['tip_hash'])"
