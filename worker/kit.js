// kit.js — the machine kit of rco-a2a.ai, generated so the words are typed once. Office standard (FO_START_ME_UP_5), Link relations only.
export const ORIGIN = "https://rco-a2a.ai", DOOR = "https://mcp.rco-a2a.ai/mcp", OPERATOR = "Agentic KG Holdings";
export const DEFINITION = "RCO is the Record of Cleared Orders. A receipt is written when a gate clears an agentic order: {decision_id, gtin, market, actor_class, rule_version, cleared_at, writer, prev_hash, hash, sig, kid}. Each receipt is hash-chained to the one before it and signed by the office key. Two tools, nothing else: write_receipt (authenticated, one bearer token per writer, returns decision_id) and verify_receipt (public, returns the receipt, its signature and the key to check it).";

// The keyring: the office signing key of record, and the historical verifying key the ledger-era receipts name (verification only; it signs nothing here).
export const JWKS = {
  keys: [
    { kty: "OKP", crv: "Ed25519", x: "82m8hAkBSciy22tOI-o0k2w-aaD8l51gwz9DTv5Yg30", kid: "rco-office-2026-10", use: "sig", alg: "EdDSA" },
    { kty: "EC", crv: "P-256", x: "a_XFfybTdOVjxBfc3umzMbGQkj5X6QS1AWCo0BvGf5s", y: "AOtaFX_7gGwdWJFwInw_q3M_S4ia8nNxyhhqxhglhak", kid: "gsc-rco-2026-08", use: "sig", alg: "ES256", status: "historical — names the ledger-era receipts loaded 2026-10-29; not a signing key on this door" },
  ],
};

export const LINK = [
  `<${ORIGIN}/llms.txt>; rel="describedby"; type="text/plain"`,
  `<${ORIGIN}/.well-known/agent-card.json>; rel="agent-card"; type="application/json"`,
  `<${ORIGIN}/.well-known/jwks.json>; rel="jwks"; type="application/json"`,
  `<${ORIGIN}/.well-known/mcp.json>; rel="mcp-server"; type="application/json"`,
  `<${ORIGIN}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
].join(", ");

export const agentCard = (version) => ({
  protocolVersion: "0.3.0", kind: "agent-card", name: "RCO-A2A — Record of Cleared Orders",
  description: DEFINITION, url: DOOR, version, documentationUrl: `${ORIGIN}/llms.txt`, iconUrl: `${ORIGIN}/icon-512.png`,
  provider: { organization: OPERATOR, url: "https://agent-kg.ai" }, contact: "mailto:mk@agent-kg.ai",
  capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
  securitySchemes: { none: { type: "noAuth", description: "verify_receipt and every read need no authentication" }, writer: { type: "httpAuth", scheme: "bearer", description: "write_receipt: one bearer token per writer, issued by the office" } },
  defaultInputModes: ["application/json"], defaultOutputModes: ["application/json"],
  skills: [
    { id: "write_receipt", name: "write_receipt", description: "Write one chained, signed receipt for a cleared agentic order; returns decision_id.", tags: ["receipt", "write", "authenticated"], inputModes: ["application/json"], outputModes: ["application/json"] },
    { id: "verify_receipt", name: "verify_receipt", description: "Return one receipt by decision_id with its signature and the key to check it.", tags: ["receipt", "verify", "public"], inputModes: ["application/json"], outputModes: ["application/json"] },
  ],
  supportedInterfaces: [{ url: DOOR, protocolBinding: "MCP", protocolVersion: "2025-06-18", transport: "streamable-http" }],
  keyring: `${ORIGIN}/.well-known/jwks.json`, kid: "rco-office-2026-10",
});

export const mcpCard = (version) => ({
  serverInfo: { name: "RCO-A2A — Record of Cleared Orders", version }, transport: { type: "streamable-http", endpoint: DOOR }, capabilities: { tools: {} },
  tools: [
    { name: "write_receipt", description: "Write one receipt for a cleared agentic order (bearer token per writer); returns decision_id.", annotations: { readOnlyHint: false, idempotentHint: true } },
    { name: "verify_receipt", description: "Return one receipt by decision_id with its signature and the key to check it (public).", annotations: { readOnlyHint: true, idempotentHint: true } },
  ],
  authentication: { reads: "none", write_receipt: "Authorization: Bearer <writer token>" },
  operator: OPERATOR, office: "https://agent-kg.ai", surface: ORIGIN, agent_card: `${ORIGIN}/.well-known/agent-card.json`, keyring: `${ORIGIN}/.well-known/jwks.json`, verify: `${ORIGIN}/receipts/{decision_id}`,
});

export const apiCatalog = () => ({ linkset: [{ anchor: DOOR, "service-desc": [{ href: `${ORIGIN}/.well-known/mcp.json`, type: "application/json" }], "service-doc": [{ href: `${ORIGIN}/llms.txt`, type: "text/plain" }], status: [{ href: `${ORIGIN}/health.json` }], "service-meta": [{ href: `${ORIGIN}/.well-known/agent-card.json`, type: "application/json" }] }] });

export const llms = (version) => `# RCO-A2A — Record of Cleared Orders

> ${DEFINITION}

Operator: ${OPERATOR} · Office: https://agent-kg.ai · Surface: ${ORIGIN} · Door: ${DOOR} · Surface version ${version}

## The receipt
{decision_id, gtin, market, actor_class, rule_version, cleared_at, writer, prev_hash, hash, sig, kid}
- hash = sha256 over the canonical JSON of {actor_class, cleared_at, decision_id, gtin, market, prev_hash, rule_version, writer} (keys sorted, no whitespace); the first receipt's prev_hash is sha256:000…0.
- sig = Ed25519 (EdDSA) over the UTF-8 bytes of the hash string, kid rco-office-2026-10, key at ${ORIGIN}/.well-known/jwks.json.
- Receipts loaded from the ledger era carry kid gsc-rco-2026-08, sig null, and the ledger transaction that holds their original hash.

## The two tools (MCP, streamable HTTP, stateless)
- write_receipt — Authorization: Bearer <writer token>; arguments gtin · market · actor_class · rule_version · cleared_at (· decision_id); returns decision_id. Idempotent on decision_id.
- verify_receipt — public; argument decision_id; returns the receipt, its chain position, its signature and the key to check it.

## Verify URL
${ORIGIN}/receipts/{decision_id} — the same answer as verify_receipt, over GET.

## Machine kit
${ORIGIN}/.well-known/agent-card.json · /.well-known/mcp.json · /.well-known/jwks.json · /.well-known/api-catalog · /.well-known/security.txt · /health.json · /robots.txt · /sitemap.xml

## Errors
Typed, in the tool result: not_authorised · invalid_receipt · invalid_decision_id · not_found · store_unavailable · store_error · chain_contention.
`;

export const robots = () => `# rco-a2a.ai — Record of Cleared Orders · Operator: ${OPERATOR}
# Open to all agents. Machine register: ${ORIGIN}/llms.txt

User-agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
Content-Signal: search=yes, ai-input=yes, ai-train=yes

# LLM discovery:  ${ORIGIN}/llms.txt
# Agent Card:     ${ORIGIN}/.well-known/agent-card.json
# MCP:            ${ORIGIN}/.well-known/mcp.json → ${DOOR}
# Keyring:        ${ORIGIN}/.well-known/jwks.json
`;

export const securityTxt = () => `Contact: mailto:mk@agent-kg.ai
Expires: 2027-10-29T00:00:00.000Z
Canonical: ${ORIGIN}/.well-known/security.txt
Preferred-Languages: en
Policy: ${ORIGIN}/security
`;

export const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["/", "/status", "/terms", "/privacy", "/security", "/no-cookies", "/llms.txt"].map((p) => `  <url><loc>${ORIGIN}${p}</loc></url>`).join("\n")}
</urlset>
`;
