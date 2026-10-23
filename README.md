# RCO-A2A

> rco-a2a.ai — Regulatory Compliance Object resolver for AI Agents. Signed, versioned, per-jurisdiction compliance state. mcp.rco-a2a.ai

**Owner of record:** Agentic KG Holdings (the Agentic Private Office, github.com/Agentic-Private-Office), from 2026-10-23. Any CEO-led company may read and write receipts; no fee; no exclusivity. The door, hostnames and keys are unchanged.

A Regulatory Compliance Object (RCO) is the signed, deterministic, machine-verifiable compliance state of one object in one jurisdiction: a GTIN in an SM-ECO-10060 member node, resolved upstream against that jurisdiction's versioned rule set and served as one record with one signal and one state. Agents consume the result of the rules, not the rules themselves. The record names the rule set it was resolved under (id, version, hash), the evidence it rests on, the issuer and the key that signed it; the agent reads the record, verifies the signature, and acts. Nothing is resolved at request time and nothing is narrative.

Canonical endpoint: https://mcp.rco-a2a.ai/mcp (streamable-http, no auth on the read tools, typed errors).

This repository is the MIT protocol layer and the connect kit: the record schema, rule-set schema, issuer-registry schema, tool contract, signature test vectors and fleet manifest under `schema/`, plus runnable examples against the live resolver. The GSC rail (records, rule sets, keys, fleet operation) is a proprietary GSC service. Nothing here carries a key, a secret or a customer.

## Tools

| Tool | What it does |
| --- | --- |
| `resolve_compliance` | Return the current signed RCO for an object in a jurisdiction. Inside the resolved universe an unknown object returns a pre-resolved, signed CPG-404 record; outside it the typed error `record_not_found`. |
| `get_record` | Return any RCO by record_id, including superseded records: the audit trail, retained byte-identical. |
| `list_issuers` | Return the signed consortium issuer registry, verbatim as published at consortium-10060.org/issuers.json. |
| `list_rule_sets` | List the versioned rule sets in force and formerly in force for a jurisdiction: id, version, hash, effective dates, artifact URL. Never the regulation text. |
| `publish_record` | Issuer-only. The one write path in the suite: publishes a signed RCO to the partner rail (rco-a2a-cpg.ai) and accepts only what already verifies against the issuer's own registered key. Behind the partner door, key per issuer. |

## Keyring and record signing

- Keyring: https://dpuone.ai/.well-known/jwks.json. GSC records carry `key_id` `gsc-rco-2026-08` and `verification_url` pointing at that keyring; the keyring is rooted in the signed issuer registry at https://consortium-10060.org/issuers.json.
- Signature: detached JWS Compact Serialization (RFC 7515 with RFC 7797 `b64:false`), ES256 over the RFC 8785 canonical JSON of the record with the `signature` member removed. The signature field is `BASE64URL(protected) || '..' || BASE64URL(signature)`. Verification verifies every byte of the canonical signing payload; nothing claims to reproduce signature bytes. Test vectors with a published test key: `schema/v1.2/signature-test-vectors.json`.
- Trust anchor: the consortium key `gsc-consortium-2026-08` is pinned on the dpuone keyring page and in DNS at `_trust-anchor.consortium-10060.org`.

## Current record-holding records

The record-holder is the pair GTIN × jurisdiction; nothing else is a unit. `resolve_compliance` returns the current record for the pair. When a pair is re-resolved, a new record is issued with the next sequence number and its `supersedes` field names the record it replaces; the superseded record is never modified or removed and stays retrievable by `get_record`. The record_id carries the sequence: `rco:<issuer>:<object_id>:<jurisdiction>:<n>`. The published list of current record-holding pairs on the GSC rail is https://rco-a2a.ai/schema/v1.3/record-holders.json.

## Examples

| Walk | Python | TypeScript |
| --- | --- | --- |
| one worked territory (IT-ECO-10060, GTIN 00990832300082): `resolve_compliance`, verify the signature against the keyring, `get_record` on the record and down its `supersedes` chain; then the same chain walk on the rail's one supersession pair, for the shape of a chain with depth | `examples/rco_walk.py` | `examples/rco_walk.ts` |

Python 3 standard library (`cryptography` for the signature check when installed). TypeScript runs on Node 24 as-is (`node examples/rco_walk.ts`) with no dependencies. Each script prints what it got and stops. Live endpoint only.

The full 19-territory pull for the elyssah case study, with the re-cut script, lives in the elyssah connect kit: https://github.com/greencore-solutions/elyssah/tree/main/rco — it pulls from this resolver; it is not duplicated here.

## Sources on the wire

https://rco-a2a.ai · https://rco-a2a-bpc.ai (GSC rail) · https://rco-a2a-cpg.ai (partner rail) · https://status.rco-a2a.ai · https://dpuone.ai/.well-known/jwks.json · https://consortium-10060.org/issuers.json · https://sm-eco-10060.org · https://acm-68000.org

Registry listing: `io.github.agentic-private-office/rco-a2a` (from 2026-10-23; the earlier `io.github.greencore-solutions/rco-a2a` entry stays, immutable, on the same door). Anthropic connector directory: rco-a2a.

---

GreenCore Solutions Corp. — 4611 Viking Way, Suite #260, Richmond BC V6V 2K9 Canada
GSC Agentic Pty Ltd — Level 1, 63-73 Ann Street, Surry Hills NSW 2010, Australia

Operated by GreenCore Solutions Corp. · https://gsc-em.com · @GSC_Rail_ai · @ACM68000
