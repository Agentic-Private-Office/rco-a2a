// rco-door 2.0.0 — RCO-01 (CEO order 2026-10-29). The Record of Cleared Orders: one Worker on mcp.rco-a2a.ai (the door) and rco-a2a.ai (the page
// and kit). Two tools, D1 store, office key, nightly export. Link relations only — no custom headers (the order overrides the X-Office set here).
import { handleMcp, verifyReceipt } from "./mcp.js";
import { JWKS, LINK, ORIGIN, DOOR, agentCard, mcpCard, apiCatalog, llms, robots, securityTxt, sitemap } from "./kit.js";
import { runExport, exportStatus } from "./export.js";

const PAGES = { "/": "/index.html", "/status": "/status.html", "/terms": "/terms.html", "/privacy": "/privacy.html", "/security": "/security.html", "/no-cookies": "/no-cookies.html" };
const KIT = { "/.well-known/agent-card.json": (env) => J(agentCard(env.VERSION)), "/.well-known/mcp.json": (env) => J(mcpCard(env.VERSION)), "/.well-known/mcp/server-card.json": (env) => J(mcpCard(env.VERSION)),
  "/.well-known/jwks.json": () => J(JWKS, "public, max-age=3600"), "/.well-known/api-catalog": () => J(apiCatalog(), "public, max-age=3600", "application/linkset+json"),
  "/.well-known/security.txt": () => T(securityTxt()), "/llms.txt": (env) => T(llms(env.VERSION)), "/robots.txt": () => T(robots()), "/sitemap.xml": () => T(sitemap(), "application/xml; charset=utf-8") };
const J = (o, cache = "no-store", ct = "application/json; charset=utf-8") => new Response(JSON.stringify(o, null, 1), { status: 200, headers: { "content-type": ct, "cache-control": cache } });
const T = (s, ct = "text/plain; charset=utf-8") => new Response(s, { status: 200, headers: { "content-type": ct, "cache-control": "public, max-age=300" } });
const notFound = (p) => new Response(JSON.stringify({ error: "not_found", path: p, door: DOOR, page: ORIGIN + "/" }), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } });
const wantsMd = (r) => { const a = r.headers.get("accept") || ""; return a.includes("text/markdown") && (a.indexOf("text/markdown") < (a.indexOf("text/html") < 0 ? 1e9 : a.indexOf("text/html"))); };
const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
function toMarkdown(html) {
  let b = (html.match(/<header class="hero">[\s\S]*?<\/main>/i) || html.match(/<main[\s\S]*?<\/main>/i) || [html])[0];   // the hero carries the definition; the twin keeps the same words
  b = b.replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, h, t) => `[${strip(t)}](${h.startsWith("/") ? ORIGIN + h : h})`);
  b = b.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, (_, t) => `\n# ${strip(t)}\n`).replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (_, t) => `\n## ${strip(t)}\n`).replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, (_, t) => `\n### ${strip(t)}\n`);
  b = b.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_, t) => `- ${strip(t)}\n`).replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (_, t) => `${strip(t)}\n\n`).replace(/<code[^>]*>([\s\S]*?)<\/code>/g, "`$1`");
  return strip(b.replace(/\n/g, "\u0000")).replace(/\u0000/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
async function page(env, file, request) {
  const r = await env.ASSETS.fetch(new Request(new URL(request.url).origin + file, { method: "GET", redirect: "manual" }));
  if (r.status !== 200) return notFound(file);
  const html = (await r.text()).replaceAll("{{version}}", env.VERSION).replaceAll("{{as_of}}", "2026-10-29");
  if (wantsMd(request)) return new Response(toMarkdown(html), { status: 200, headers: { "content-type": "text/markdown; charset=utf-8", vary: "Accept", "cache-control": "public, max-age=300" } });
  return new Response(request.method === "HEAD" ? null : html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", vary: "Accept", "cache-control": "public, max-age=300", "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", "referrer-policy": "strict-origin-when-cross-origin", "x-content-type-options": "nosniff" } });
}
const withLink = (res) => { const h = new Headers(res.headers); h.set("link", LINK); return new Response(res.body, { status: res.status, headers: h }); };

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(runExport(env, new Date().toISOString().slice(0, 10))); },
  async fetch(request, env) {
    const url = new URL(request.url), host = url.hostname, path = url.pathname.replace(/\/+$/, "") || "/";
    // the door host answers the door and the kit; its root tells an agent where the page is
    if (host.startsWith("mcp.")) {
      if (path === "/mcp") return withLink(await handleMcp(request, env, url));
      if (path === "/stats" || path === "/stats.json") return withLink(await statsLine(env, path === "/stats.json"));
      if (path === "/" || path === "/health.json") return withLink(J({ status: "ok", door: DOOR, page: ORIGIN + "/", tools: ["write_receipt", "verify_receipt"], version: env.VERSION, store: env.DB ? "bound" : "not bound", time: new Date().toISOString() }));
      if (path === "/receipts/stats.json") return withLink(await stats(env));
      if (KIT[path]) return withLink(KIT[path](env));
      return withLink(notFound(path));
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD, OPTIONS" } });
    if (path === "/mcp") return Response.redirect(DOOR, 308);
    if (KIT[path]) return withLink(KIT[path](env));
    if (path === "/health.json") return withLink(J({ status: "ok", surface: ORIGIN, door: DOOR, version: env.VERSION, store: env.DB ? "bound" : "not bound", export: await exportStatus(env), time: new Date().toISOString() }));
    if (path === "/export/status.json") return withLink(J(await exportStatus(env)));
    if (path === "/receipts/stats.json") return withLink(await stats(env));
    if (path === "/stats" || path === "/stats.json") return withLink(await statsLine(env, path === "/stats.json"));   // RECEIPTS-01: counts only, no caller data
    const m = /^\/receipts\/([a-z]{2,12}_[0-9a-f]{8,48})$/.exec(path);
    if (m) { const r = await verifyReceipt(env, m[1]); const body = r.structuredContent; return withLink(new Response(JSON.stringify(body, null, 1), { status: r.isError ? (body.code === "not_found" ? 404 : body.code === "store_unavailable" ? 503 : 400) : 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": r.isError ? "no-store" : "public, max-age=31536000, immutable", "access-control-allow-origin": "*" } })); }
    if (PAGES[path]) return withLink(await page(env, PAGES[path], request));
    const a = await env.ASSETS.fetch(request);   // styles, fonts, icons — real 404 otherwise
    return a.status === 200 ? a : withLink(notFound(path));
  },
};

// RECEIPTS-01: the /stats line — counts only (total, by day, by writer, by market), never a caller or an id.
async function statsLine(env, json) {
  if (!env.DB) return J({ store: "not bound" });
  const day = new Date().toISOString().slice(0, 10), yday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const [tot, bd, bw, bm] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) n FROM receipts").first(),
    env.DB.prepare("SELECT substr(cleared_at,1,10) d, COUNT(*) n FROM receipts WHERE cleared_at >= date('now','-30 days') GROUP BY d ORDER BY d").all(),
    env.DB.prepare("SELECT COALESCE(writer,'unattributed') w, COUNT(*) n FROM receipts GROUP BY w ORDER BY n DESC").all(),
    env.DB.prepare("SELECT market, COUNT(*) n FROM receipts WHERE market IS NOT NULL GROUP BY market ORDER BY n DESC").all(),
  ]);
  const by_day = Object.fromEntries(bd.results.map((r) => [r.d, r.n])), by_writer = Object.fromEntries(bw.results.map((r) => [r.w, r.n])), by_market = Object.fromEntries(bm.results.map((r) => [r.market, r.n]));
  const o = { receipts: tot.n, today: by_day[day] || 0, last_full_day: { day: yday, receipts: by_day[yday] || 0 }, by_day, by_writer, by_market, as_of: new Date().toISOString(), note: "counts only" };
  if (json) return J(o);
  const line = `receipts ${o.receipts} · today ${o.today} · ${yday} ${o.last_full_day.receipts} · writers ${Object.entries(by_writer).map(([k, v]) => `${k} ${v}`).join(", ")} · markets ${Object.keys(by_market).length} · as of ${o.as_of}\n`;
  return new Response(line, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } });
}

// Counts for the Allooloo digest (RCO-A-01 reads /receipts/stats.json nightly): by_day_writer · by_writer · ledger.pending (always 0 here: the chain is the store).
async function stats(env) {
  if (!env.DB) return J({ door: DOOR, store: "not bound", by_writer: {}, by_day_writer: {}, ledger: { pending: 0 } });
  const [bw, bdw, tip] = await Promise.all([
    env.DB.prepare("SELECT writer, COUNT(*) n FROM receipts GROUP BY writer").all(),
    env.DB.prepare("SELECT substr(cleared_at,1,10) d, writer, COUNT(*) n FROM receipts WHERE cleared_at >= date('now','-35 days') GROUP BY d, writer").all(),
    env.DB.prepare("SELECT seq, hash, decision_id, written_at FROM receipts ORDER BY seq DESC LIMIT 1").first(),
  ]);
  const by_writer = {}, by_day_writer = {};
  for (const r of bw.results) by_writer[r.writer ?? "unattributed"] = r.n;
  for (const r of bdw.results) (by_day_writer[r.d] ||= {})[r.writer ?? "unattributed"] = r.n;
  return J({ door: DOOR, total: tip ? tip.seq : 0, tip: tip ? { seq: tip.seq, hash: tip.hash, decision_id: tip.decision_id, written_at: tip.written_at } : null, by_writer, by_day_writer, ledger: { pending: 0, note: "the chain is the store; nothing is deferred" }, keyring: ORIGIN + "/.well-known/jwks.json" });
}
