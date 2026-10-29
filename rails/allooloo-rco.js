// rco.js — RCO-01 (CEO order 2026-10-29, amendment: one writer, allooloo): Allooloo writes receipts to the new RCO door. A read that clears a
// decision (an ISIN resolved, a signal returned, an ECO rule read) leaves one receipt on mcp.rco-a2a.ai in the record of cleared orders:
// {decision_id, gtin, market, actor_class, rule_version, cleared_at} — the door adds writer, prev_hash, hash, sig (Ed25519, kid rco-office-2026-10).
// Authentication is the office-issued bearer token (secret RCO_DOOR_TOKEN). The write runs after the answer (ctx.waitUntil): the caller never waits.
// The gate body built by index.js is kept (object · actor_class · rule · records_read · signal · decided_at · issuing_door); this file maps it onto
// the record: gtin ← object.id (the cleared object's identifier: an ISIN, ticker, LEI or node record on these doors), market ← the node's country
// code in rule.id, rule_version ← rule.id · rule.version, cleared_at ← decided_at. The previous Allooloo signature (RCO_SIGNING_JWK) is no longer
// sent: the door signs. Previous file beside this one as rco.js.pre-rco01-2026-10-29. One copy per Worker folder.
const RCO = 'https://mcp.rco-a2a.ai/mcp';
export const RCO_KID = 'rco-office-2026-10';
export const RCO_KEYRING = 'https://rco-a2a.ai/.well-known/jwks.json';
const enc = new TextEncoder();
export const decisionId = () => 'dec_' + [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
export async function sha256(s) { return 'sha256:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(typeof s === 'string' ? s : JSON.stringify(s))))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export const receiptLinks = id => ({ decision_id: id, verify_receipt: { door: RCO, tool: 'verify_receipt', arguments: { decision_id: id } }, page: `https://rco-a2a.ai/receipts/${id}` });
const cc = s => { const m = /^([a-z]{2})-cm-kg/i.exec(String(s || '')); return m ? m[1].toUpperCase() : null; };
export function recordOf(body) {
  const o = body.object || {};
  return { decision_id: body.decision_id, gtin: String(o.id || body.gtin || '').slice(0, 80) || null, market: body.market || cc(body.rule && body.rule.id) || cc(body.issuing_door && new URL(body.issuing_door).hostname.replace(/^mcp\./, '')) || null,
    actor_class: body.actor_class || null, rule_version: body.rule ? [body.rule.id, body.rule.version].filter(Boolean).join(' · ') : (body.rule_version || null), cleared_at: body.decided_at || body.cleared_at || new Date().toISOString() };
}
export async function writeReceipt(env, body) {
  if (!env || !env.RCO_DOOR_TOKEN) { console.log('rco receipt not written: RCO_DOOR_TOKEN absent', body.decision_id); return null; }
  const record = recordOf(body);
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await fetch(RCO, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer ' + String(env.RCO_DOOR_TOKEN).replace(/^﻿/, '').trim(), 'user-agent': 'Allooloo rco-writer (RCO-01)' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'write_receipt', arguments: record } }) });
      const j = await r.json().catch(() => null); const res = j && j.result;
      const out = res && (res.structuredContent || (res.content && res.content[0] && JSON.parse(res.content[0].text)));
      if (res && !res.isError) { console.log('rco receipt written', record.decision_id, out && out.hash); return out; }
      console.log('rco receipt refused', record.decision_id, 'attempt', attempt, JSON.stringify(out || j).slice(0, 300));
      if (out && /invalid_receipt|not_authorised|invalid_decision_id/.test(out.code || '')) return out;
      await new Promise(s => setTimeout(s, 1500 * attempt));
    }
  } catch (e) { console.log('rco receipt error', record.decision_id, String(e).slice(0, 200)); }
  return null;
}
