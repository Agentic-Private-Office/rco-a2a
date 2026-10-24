# RCO-A2A

> rco-a2a.ai — RCO, the Record of Cleared Orders: the signed receipt of one cleared decision, read by decision id. mcp.rco-a2a.ai

**Owner of record:** Agentic KG Holdings (the Agentic Private Office, github.com/Agentic-Private-Office), from 2026-10-23. The standard is MIT-licensed and implemented by any CEO-led company's doors. Reads are free; write keys are issued by the office at no charge to implementers.

RCO is the Record of Cleared Orders: a signed, machine-verifiable record of one cleared decision. When an agent's door clears a decision — an issuer resolved, a product cleared under a rule, a signal returned — it leaves one receipt. The receipt is the thing a compliance officer is asked for, and the thing a licensed participant's agent must be able to produce. The standard's page is https://rco-10060.org/.

The earlier reading of RCO (a "regulatory compliance object", a product's compliance state per jurisdiction) is retired. Its five v1 tools are not on the wire; its schemas stay under `schema/v1.2` … `v1.4` as history.

Canonical endpoint: https://mcp.rco-a2a.ai/mcp (streamable-http, JSON-RPC 2.0, typed errors).

## The receipt

| Field | What it holds |
| --- | --- |
| `decision_id` | the id the decision was given by the door that made it |
| object identifier | what was cleared: a GTIN, an ISIN, a product id — the identifier says what kind of order it was |
| `actor_class` | for which actor class (never a person) |
| rule object and version | under which rule the decision was made |
| records read | which records were read, each with its signature (kid) |
| signal | ACM-200 · ACM-403 · ACM-404 · ACM-451 (https://acm-68000.org/) |
| time | when |
| issuing door | which door issued it |
| signature | the issuing door's detached JWS, verifiable against its published keyring |
| ledger | the Azure Confidential Ledger (gsc-rco-ledger) transaction id under which the receipt's hash was written |

One schema for every object type. No caller data, no personal data, no amounts.

## Tools

| Tool | Who | What it does |
| --- | --- | --- |
| `get_receipt(decision_id)` | anyone, no account | Return the signed receipt of one cleared decision. |
| `write_receipt(receipt)` | authorised doors (a key issued by the office) | Write a receipt: the door verifies the issuer's signature against its keyring, writes the hash to the ledger and keeps the receipt. Idempotent on `decision_id`. |

The same receipt is a page at `https://rco-a2a.ai/receipts/{decision_id}` and JSON at `https://rco-a2a.ai/receipts/{decision_id}.json`.

## Writers and readers

- **Writers:** the hub gates of A2A Grocery, A2A Cosmetics and A2A Peptides; Allooloo's resolver (getissuer) and market nodes; any licensed firm's own agent through the write path with a key.
- **Readers:** anyone — the firm's audit function, its regulator, its counterparty.

## Verify a receipt

1. Signature: take `kid` from the signature's protected header and fetch that key from the issuing door's keyring (named in the receipt); verify the detached JWS over the canonical JSON of the receipt (keys sorted, compact, UTF-8) without the signature, signature check and ledger fields.
2. Ledger: the receipt's `ledger.transaction_id` on `gsc-rco-ledger.confidential-ledger.azure.com`; the hash preimage is the RFC 8785 canonical JSON of the receipt without `ledger`, `receipt_url`, `page` and the signature check. Ledger identity certificate: https://identity.confidential-ledger.core.azure.com/ledgerIdentity/gsc-rco-ledger

Verification proves what the issuer stated; it does not make the operator a regulator.

## Examples

`examples/get_receipt.py` reads one live receipt (Python 3 standard library) and prints it:

```
python examples/get_receipt.py gate_dec1d9aaa478b3ef94e4
```

The walks of the retired v1 tools are kept as history under `examples/v1-retired/`; they do not run against the current door.

## Doors by what they resolve

GTINs → https://gtinfetch.ai/mcp · listed issuers → https://mcp.getissuer.ai/mcp · receipts → https://mcp.rco-a2a.ai/mcp

## Sources on the wire

https://rco-a2a.ai · https://rco-10060.org · https://status.rco-a2a.ai · https://acm-68000.org

Registry listing: `io.github.Agentic-Private-Office/rco-a2a`. Anthropic connector directory: rco-a2a.

---

© 2026 Agentic KG Holdings · reference operator · MIT licence. The door runs on GreenCore Solutions Corp. compute; the ledger, keys and door are unchanged by the ownership line.
