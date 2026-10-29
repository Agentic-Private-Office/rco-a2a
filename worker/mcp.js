// mcp.js — rco-door 2.0.0. Streamable HTTP, stateless, JSON-RPC 2.0. Two tools and nothing else:
//   write_receipt  — bearer token per writer; appends one chained, signed receipt; returns decision_id (idempotent on decision_id)
//   verify_receipt — public; returns the receipt, its signature and the key to check it
// Typed errors ride in the tool result as { code, message } with isError: true. No resolve_compliance, no rails, no issuers.
import { GENESIS, hashOf, sign, sha256hex, PUBLIC } from "./chain.js";
import { JWKS } from "./kit.js";

export const SERVER = { name: "RCO-A2A — Record of Cleared Orders", protocolVersion: "2025-06-18" };
export const TOOLS = [
  {
    name: "write_receipt",
    description: "Write one receipt for an agentic order a gate has cleared. Authenticated: Authorization: Bearer <writer token>. Returns the decision_id; idempotent on decision_id.",
    inputSchema: {
      type: "object",
      properties: {
        decision_id: { type: "string", description: "the gate's decision id (dec_<hex>); minted here when absent" },
        gtin: { type: "string", description: "the cleared object's identifier (a GTIN on goods rails; the ISIN or issuer identifier on a market door)" },
        market: { type: "string", description: "ISO 3166-1 alpha-2 market code" },
        actor_class: { type: "string" },
        rule_version: { type: "string", description: "the rule set and version the gate applied" },
        cleared_at: { type: "string", description: "RFC 3339 UTC; the door's clock when absent" },
      },
      required: ["gtin", "actor_class", "rule_version"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "verify_receipt",
    description: "Return one receipt by decision_id with its chain position, its signature and the public key (JWK) that checks it. Public.",
    inputSchema: { type: "object", properties: { decision_id: { type: "string" } }, required: ["decision_id"] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

const JSONH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const rpc = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id, code, message, data) => ({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
const typed = (code, message, extra) => ({ isError: true, content: [{ type: "text", text: JSON.stringify({ code, message, ...(extra || {}) }) }], structuredContent: { code, message, ...(extra || {}) } });
const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj) }], structuredContent: obj });
const ID = /^[a-z]{2,12}_[0-9a-f]{8,48}$/;
const newId = () => "dec_" + [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");

// Writers: the bearer's sha256 is compared with the hash placed as a Worker secret; the token itself never sits on the door.
async function writerOf(request, env) {
  const h = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(\S+)$/i.exec(h); if (!m) return null;
  const d = await sha256hex(m[1]);
  const table = { allooloo: env.WRITER_HASH_ALLOOLOO };   // RCO-01 (CEO amendment 2026-10-29): one writer only
  for (const [w, hash] of Object.entries(table)) if (hash && d === String(hash).trim().toLowerCase()) return w;
  return null;
}

// Tolerant intake: the flat record, or a gate body carrying object.id / decided_at / rule.version.
function normalise(a) {
  const s = (v, n) => (v === undefined || v === null ? null : String(v).slice(0, n));
  const r = a && typeof a === "object" && a.receipt && typeof a.receipt === "object" ? a.receipt : a || {};
  const gtin = r.gtin ?? (r.object && (r.object.gtin ?? r.object.id)) ?? null;
  const cleared = r.cleared_at ?? r.decided_at ?? null;
  const t = cleared && !isNaN(Date.parse(cleared)) ? new Date(cleared).toISOString() : new Date().toISOString();
  return {
    decision_id: ID.test(String(r.decision_id || "")) ? String(r.decision_id) : newId(),
    gtin: s(gtin, 80), market: s(r.market ? String(r.market).toUpperCase() : null, 16), actor_class: s(r.actor_class, 80),
    rule_version: s(r.rule_version ?? (r.rule && (r.rule.version ? `${r.rule.id ? r.rule.id + " · " : ""}${r.rule.version}` : r.rule.id)), 160),
    cleared_at: t,
  };
}

async function writeReceipt(env, writer, args) {
  if (!env.DB) return typed("store_unavailable", "the receipt store is not bound on this door yet");
  const r = normalise(args);
  if (!r.gtin) return typed("invalid_receipt", "gtin (the cleared object's identifier) is required");
  if (!r.actor_class) return typed("invalid_receipt", "actor_class is required");
  if (!r.rule_version) return typed("invalid_receipt", "rule_version is required");
  const have = await env.DB.prepare("SELECT * FROM receipts WHERE decision_id = ?1").bind(r.decision_id).first();
  if (have) return ok({ decision_id: have.decision_id, hash: have.hash, seq: have.seq, idempotent: true, verify: `https://rco-a2a.ai/receipts/${have.decision_id}` });
  for (let attempt = 0; attempt < 4; attempt++) {
    const tip = await env.DB.prepare("SELECT hash FROM receipts ORDER BY seq DESC LIMIT 1").first();
    const row = { ...r, writer, prev_hash: tip ? tip.hash : GENESIS };
    row.hash = await hashOf(row);
    row.sig = await sign(env, row.hash); row.kid = env.KID || "rco-office-2026-10";
    try {
      const res = await env.DB.prepare("INSERT INTO receipts (decision_id,gtin,market,actor_class,rule_version,cleared_at,writer,prev_hash,hash,sig,kid) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) RETURNING seq")
        .bind(row.decision_id, row.gtin, row.market, row.actor_class, row.rule_version, row.cleared_at, row.writer, row.prev_hash, row.hash, row.sig, row.kid).first();
      return ok({ decision_id: row.decision_id, hash: row.hash, prev_hash: row.prev_hash, seq: res && res.seq, kid: row.kid, verify: `https://rco-a2a.ai/receipts/${row.decision_id}` });
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/UNIQUE.*decision_id/i.test(msg)) { const h = await env.DB.prepare("SELECT * FROM receipts WHERE decision_id = ?1").bind(r.decision_id).first(); if (h) return ok({ decision_id: h.decision_id, hash: h.hash, seq: h.seq, idempotent: true, verify: `https://rco-a2a.ai/receipts/${h.decision_id}` }); }
      if (!/UNIQUE.*prev_hash/i.test(msg)) return typed("store_error", "the store refused the write", { detail: msg.slice(0, 200) });
      // another writer took the tip between our read and our insert: re-read and retry
    }
  }
  return typed("chain_contention", "the chain tip moved four times during this write; retry");
}

export async function verifyReceipt(env, decisionId) {
  if (!env.DB) return typed("store_unavailable", "the receipt store is not bound on this door yet");
  const id = String(decisionId || "").trim();
  if (!ID.test(id)) return typed("invalid_decision_id", "decision_id must look like dec_<hex>");
  const row = await env.DB.prepare("SELECT * FROM receipts WHERE decision_id = ?1").bind(id).first();
  if (!row) return typed("not_found", "no receipt with that decision_id", { decision_id: id });
  const recomputed = await hashOf(row);
  const key = JWKS.keys.find((k) => k.kid === row.kid) || null;
  const out = {
    receipt: PUBLIC(row), seq: row.seq,
    chain: { prev_hash: row.prev_hash, hash: row.hash, recomputed, intact: recomputed === row.hash, canonical: "JSON of {actor_class, cleared_at, decision_id, gtin, market, prev_hash, rule_version, writer}, keys sorted, no whitespace; hash = sha256 hex" },
    signature: row.sig ? { alg: "EdDSA", kid: row.kid, sig: row.sig, over: "the UTF-8 bytes of the hash string", key } : null,
    key, keyring: "https://rco-a2a.ai/.well-known/jwks.json",
  };
  if (row.ledger_txn) out.ledger = { name: "gsc-rco-ledger (Azure Confidential Ledger, read-only)", transaction_id: row.ledger_txn, lodged_hash: row.ledger_hash, kid: row.kid, note: "historical receipt loaded 2026-10-29: the ledger holds the original hash; the chain hash above is this door's" };
  return ok(out);
}

export async function handleMcp(request, env, url) {
  const origin = request.headers.get("origin");
  if (origin && !/^https:\/\//i.test(origin)) return new Response(JSON.stringify(rpcErr(null, -32600, "origin not allowed")), { status: 403, headers: JSONH });
  const H = { ...JSONH, "access-control-allow-origin": origin || "*", "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version", vary: "Origin" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method === "GET") return new Response(JSON.stringify({ server: { ...SERVER, version: env.VERSION }, transport: "streamable-http", endpoint: `${url.origin}/mcp`, usage: "POST JSON-RPC 2.0: initialize, tools/list, tools/call", tools: TOOLS.map((t) => t.name), card: "https://rco-a2a.ai/.well-known/mcp.json", agent_card: "https://rco-a2a.ai/.well-known/agent-card.json", keyring: "https://rco-a2a.ai/.well-known/jwks.json" }, null, 1), { status: 200, headers: H });
  if (request.method !== "POST") return new Response(JSON.stringify(rpcErr(null, -32600, "POST required")), { status: 405, headers: { ...H, allow: "POST, GET, OPTIONS" } });
  let msgs; try { msgs = await request.json(); } catch { return new Response(JSON.stringify(rpcErr(null, -32700, "parse error")), { status: 400, headers: H }); }
  const batch = Array.isArray(msgs); const out = [];
  for (const m of batch ? msgs : [msgs]) {
    const id = m && m.id !== undefined ? m.id : null;
    if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") { out.push(rpcErr(id, -32600, "invalid request")); continue; }
    if (m.method.startsWith("notifications/")) continue;
    try {
      if (m.method === "initialize") out.push(rpc(id, { protocolVersion: (m.params && m.params.protocolVersion) || SERVER.protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: SERVER.name, version: env.VERSION }, instructions: "RCO — Record of Cleared Orders. A receipt is written when a gate clears an agentic order: {decision_id, gtin, market, actor_class, rule_version, cleared_at, writer, prev_hash, hash, sig, kid}, hash-chained and signed by the office key. Two tools: write_receipt (bearer token per writer) and verify_receipt (public). Errors are typed. Nothing is answered from memory." }));
      else if (m.method === "ping") out.push(rpc(id, {}));
      else if (m.method === "tools/list") out.push(rpc(id, { tools: TOOLS }));
      else if (m.method === "tools/call") {
        const name = m.params && m.params.name, args = (m.params && m.params.arguments) || {};
        if (name === "verify_receipt") out.push(rpc(id, await verifyReceipt(env, args.decision_id)));
        else if (name === "write_receipt") {
          const w = await writerOf(request, env);
          out.push(rpc(id, w ? await writeReceipt(env, w, args) : typed("not_authorised", "write_receipt needs Authorization: Bearer <writer token> issued by the office")));
        } else out.push(rpcErr(id, -32602, `unknown tool: ${name}`, { tools: TOOLS.map((t) => t.name) }));
      } else out.push(rpcErr(id, -32601, `method not found: ${m.method}`));
    } catch (e) { out.push(rpcErr(id, -32603, "internal error")); }
  }
  if (!out.length) return new Response(null, { status: 202, headers: H });
  return new Response(JSON.stringify(batch ? out : out[0], null, 1), { status: 200, headers: H });
}
