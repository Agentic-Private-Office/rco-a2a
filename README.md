# RCO-A2A — Record of Cleared Orders

RCO is the Record of Cleared Orders. A receipt is written when a gate clears an agentic order:

```
{decision_id, gtin, market, actor_class, rule_version, cleared_at, writer, prev_hash, hash, sig, kid}
```

Each receipt is hash-chained to the one before it and signed by the office key. Two tools, nothing else:

- `write_receipt` — authenticated (`Authorization: Bearer <writer token>`, one token per writer), returns `decision_id`. Idempotent on `decision_id`.
- `verify_receipt(decision_id)` — public, returns the receipt, its chain position, its signature and the key to check it.

Door: `https://mcp.rco-a2a.ai/mcp` (Model Context Protocol, streamable HTTP, stateless, JSON-RPC 2.0). Page and kit: `https://rco-a2a.ai/`. Verify URL: `https://rco-a2a.ai/receipts/{decision_id}`. Ledger held by the Agentic Private Office.

## The chain

- `hash` = `sha256:` + hex of SHA-256 over the canonical JSON of `{actor_class, cleared_at, decision_id, gtin, market, prev_hash, rule_version, writer}` — keys sorted, no whitespace, nulls kept.
- The first receipt's `prev_hash` is `sha256:` + 64 zeros.
- `sig` = Ed25519 (EdDSA) over the UTF-8 bytes of the `hash` string, base64url. `kid` names the key on `https://rco-a2a.ai/.well-known/jwks.json` (`rco-office-2026-10`).
- Receipts loaded from the ledger era (2026-10-15 → 2026-10-27) carry `kid` `gsc-rco-2026-08`, `sig` null, and the Azure Confidential Ledger transaction that holds their original hash. Fields the ledger never held are null.

## Connect

MCP client configuration (any client that speaks streamable HTTP):

```json
{ "mcpServers": { "rco-a2a": { "type": "streamable-http", "url": "https://mcp.rco-a2a.ai/mcp" } } }
```

Verify one receipt from a shell:

```bash
curl -s https://mcp.rco-a2a.ai/mcp -H 'content-type: application/json' -H 'accept: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"verify_receipt","arguments":{"decision_id":"dec_b73fe75bff87ef889d8ca304"}}}'
```

or `GET https://rco-a2a.ai/receipts/dec_b73fe75bff87ef889d8ca304`.

Check a signature (Python):

```python
import json, base64, requests
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
r = requests.get("https://rco-a2a.ai/receipts/" + DECISION_ID).json()
k = next(k for k in requests.get("https://rco-a2a.ai/.well-known/jwks.json").json()["keys"] if k["kid"] == r["receipt"]["kid"])
pad = lambda s: s + "=" * (-len(s) % 4)
Ed25519PublicKey.from_public_bytes(base64.urlsafe_b64decode(pad(k["x"]))).verify(base64.urlsafe_b64decode(pad(r["receipt"]["sig"])), r["receipt"]["hash"].encode())
```

## Errors

Typed, inside the tool result (`isError: true`): `not_authorised` · `invalid_receipt` · `invalid_decision_id` · `not_found` · `store_unavailable` · `store_error` · `chain_contention`.

## Source

`worker/` — the Cloudflare Worker (`index.js` routes and kit, `mcp.js` the two tools, `chain.js` the record and its chain, `export.js` the nightly copy to the office's S3 bucket). `schema.sql` — the D1 table, append-only (triggers refuse UPDATE and DELETE). `public/` — the office page and the five record pages. `rails/` — the history loader and the D1 rail. No secret is in this repository.

MIT. © 2026 Agentic KG Holdings.
