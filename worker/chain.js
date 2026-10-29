// chain.js — the record and its chain. One spec, shared with rails/load_history.py: canonical JSON = keys sorted, no whitespace, nulls kept;
// hash = "sha256:" + hex over the UTF-8 bytes of that JSON; genesis prev_hash = sha256 of nothing (64 zeros); sig = Ed25519 over the UTF-8 bytes of
// the hash string, base64url, kid rco-office-2026-10. Historical rows (loaded from the ledger) carry sig null and kid gsc-rco-2026-08.
export const GENESIS = "sha256:" + "0".repeat(64);
export const CHAINED = ["actor_class", "cleared_at", "decision_id", "gtin", "market", "prev_hash", "rule_version", "writer"];
const enc = new TextEncoder();
export const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
export const canonical = (row) => JSON.stringify(Object.fromEntries(CHAINED.map((k) => [k, row[k] === undefined ? null : row[k]])));
export async function hashOf(row) { return "sha256:" + hex(await crypto.subtle.digest("SHA-256", enc.encode(canonical(row)))); }
export async function sha256hex(s) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }

let KEY = null;
async function signingKey(env) {
  if (KEY) return KEY;
  const seed = unb64u(String(env.RCO_SIGN_SEED || "").replace(/^﻿/, "").trim());
  // PKCS#8 wrapper for a raw Ed25519 seed (RFC 8410): 302e020100300506032b657004220420 || seed
  const pkcs8 = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20, ...seed]);
  KEY = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
  return KEY;
}
export async function sign(env, hash) { return b64u(await crypto.subtle.sign("Ed25519", await signingKey(env), enc.encode(hash))); }

export const PUBLIC = (row) => ({
  decision_id: row.decision_id, gtin: row.gtin, market: row.market, actor_class: row.actor_class, rule_version: row.rule_version,
  cleared_at: row.cleared_at, writer: row.writer, prev_hash: row.prev_hash, hash: row.hash, sig: row.sig, kid: row.kid,
});
