// One worked territory on RCO-A2A: resolve, verify, and walk the record chain.
// Walk: resolve_compliance(gtin:00990832300082, IT-ECO-10060) -> verify the ES256 signature against the dpuone
// keyring -> get_record on the record and down its `supersedes` chain -> the same chain walk on the rail's one
// supersession pair (for the shape of a chain with depth) -> print -> stop. Node 24, no dependencies.
// Usage: node rco_walk.ts [OBJECT_ID] [JURISDICTION]
import { createPublicKey, verify as cryptoVerify } from "node:crypto";

const MCP = "https://mcp.rco-a2a.ai/mcp";
const KEYRING = "https://dpuone.ai/.well-known/jwks.json";
const UA = "rco-a2a-kit/1.0 (+https://github.com/greencore-solutions/rco-a2a)";
const OBJECT_ID = process.argv[2] ?? "gtin:00990832300082";
const JURIS = process.argv[3] ?? "IT-ECO-10060";
const CHAIN_DEMO = "rco:gsc:gtin:00990832300105:FR-ECO-10060:2"; // the rail's one supersession, as of 2026-09-09

async function call(name: string, args: Record<string, unknown>, id: number): Promise<any> {
  const r = await fetch(MCP, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) });
  const raw = await r.text();
  const msg = raw.trimStart().startsWith("{") ? JSON.parse(raw) : JSON.parse(raw.split("\n").find((l) => l.startsWith("data:"))!.slice(5));
  if (msg.error) return { error: msg.error };
  if (msg.result.isError) return { error: JSON.parse(msg.result.content[0].text) };
  return msg.result.structuredContent ?? JSON.parse(msg.result.content[0].text);
}

// RFC 8785 canonical JSON for the value space these records use (strings, integers, null, objects, arrays)
function jcs(v: any): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(jcs).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + jcs(v[k])).join(",") + "}";
}

const KEYS = (await (await fetch(KEYRING, { headers: { "User-Agent": UA } })).json()).keys as any[];

function verify(rec: any): string {
  const [protectedB64, , sigB64] = rec.signature.split(".");
  const hdr = JSON.parse(Buffer.from(protectedB64, "base64url").toString("utf8"));
  const jwk = KEYS.find((k) => k.kid === hdr.kid);
  if (!jwk) return `FAILED - kid ${hdr.kid} not on the keyring`;
  const { signature: _s, ...body } = rec;
  const input = Buffer.concat([Buffer.from(protectedB64 + ".", "ascii"), Buffer.from(jcs(body), "utf8")]);
  const ok = cryptoVerify("sha256", input, { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(sigB64, "base64url"));
  return ok ? `verified - ES256, kid ${jwk.kid}` : "FAILED - does not verify";
}

const brief = (rec: any) => `${rec.record_id} | ${rec.signal} ${rec.state} | resolved ${rec.resolved_at} | valid_until ${rec.valid_until} | supersedes ${rec.supersedes}`;

async function walkChain(recordId: string | null, id: number): Promise<number> {
  let depth = 0;
  while (recordId) {
    const rec = await call("get_record", { record_id: recordId }, id++);
    if (rec.error) { console.log(`   get_record(${recordId}) ->`, JSON.stringify(rec.error)); break; }
    depth++;
    console.log(`   get_record -> ${brief(rec)}  [${verify(rec)}]`);
    recordId = rec.supersedes ?? null;
  }
  console.log("   chain depth:", depth);
  return id;
}

console.log(`1 resolve_compliance(${OBJECT_ID}, ${JURIS})`);
const rec = await call("resolve_compliance", { object_id: OBJECT_ID, jurisdiction: JURIS }, 1);
if (rec.error) { console.log("   ->", JSON.stringify(rec.error)); process.exit(1); }
console.log("   ->", brief(rec));
console.log("   issuer", rec.issuer.name, "| rail", rec.issuer.rail, "| key_id", rec.key_id, "| case_study", rec.case_study);
console.log("2 verify against", KEYRING, "->", verify(rec));
console.log("3 get_record down the supersedes chain from", rec.record_id);
const next = await walkChain(rec.record_id, 2);
console.log("4 the rail's one supersession pair, for the shape:", CHAIN_DEMO);
await walkChain(CHAIN_DEMO, next);
