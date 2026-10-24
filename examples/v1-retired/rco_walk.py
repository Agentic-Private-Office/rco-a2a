#!/usr/bin/env python3
"""One worked territory on RCO-A2A: resolve, verify, and walk the record chain.

Walk: resolve_compliance(gtin:00990832300082, IT-ECO-10060) -> verify the ES256 signature against the
dpuone keyring -> get_record on the record and down its `supersedes` chain -> the same chain walk on the
rail's one supersession pair (for the shape of a chain with depth) -> print -> stop.
Standard library only; the signature check uses `cryptography` when installed and is reported as skipped otherwise.
Usage: python rco_walk.py [OBJECT_ID] [JURISDICTION]
"""
import base64, json, sys, urllib.request

MCP = "https://mcp.rco-a2a.ai/mcp"
KEYRING = "https://dpuone.ai/.well-known/jwks.json"
UA = "rco-a2a-kit/1.0 (+https://github.com/greencore-solutions/rco-a2a)"
OBJECT_ID = sys.argv[1] if len(sys.argv) > 1 else "gtin:00990832300082"
JURIS = sys.argv[2] if len(sys.argv) > 2 else "IT-ECO-10060"
CHAIN_DEMO = "rco:gsc:gtin:00990832300105:FR-ECO-10060:2"   # the rail's one supersession, as of 2026-09-09


def call(name, args, req_id):
    body = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": "tools/call", "params": {"name": name, "arguments": args}}).encode("utf-8")
    req = urllib.request.Request(MCP, data=body, headers={"User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json, text/event-stream"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read().decode("utf-8")
    msg = json.loads(raw) if raw.lstrip().startswith("{") else next(json.loads(l[5:]) for l in raw.splitlines() if l.startswith("data:"))
    if "error" in msg:
        return {"error": msg["error"]}
    res = msg["result"]
    if res.get("isError"):
        return {"error": json.loads(res["content"][0]["text"])}
    return res.get("structuredContent") or json.loads(res["content"][0]["text"])


def b64u(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def verify(rec, keys):
    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
    except ImportError:
        return "not checked (pip install cryptography)"
    protected_b64, _, sig_b64 = rec["signature"].split(".")
    protected = json.loads(b64u(protected_b64))
    key = next((k for k in keys if k.get("kid") == protected.get("kid")), None)
    if key is None:
        return "FAILED - kid %s not on the keyring" % protected.get("kid")
    pub = ec.EllipticCurvePublicNumbers(int.from_bytes(b64u(key["x"]), "big"), int.from_bytes(b64u(key["y"]), "big"), ec.SECP256R1()).public_key()
    body = {k: v for k, v in rec.items() if k != "signature"}
    signing_input = protected_b64.encode("ascii") + b"." + json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    raw = b64u(sig_b64)
    try:
        pub.verify(encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big")), signing_input, ec.ECDSA(hashes.SHA256()))
        return "verified - ES256, kid %s" % key["kid"]
    except Exception:
        return "FAILED - does not verify"


def brief(rec):
    return "%s | %s %s | resolved %s | valid_until %s | supersedes %s" % (
        rec["record_id"], rec["signal"], rec["state"], rec["resolved_at"], rec["valid_until"], rec.get("supersedes"))


def walk_chain(record_id, req_id):
    depth = 0
    while record_id:
        rec = call("get_record", {"record_id": record_id}, req_id)
        req_id += 1
        if "error" in rec:
            print("   get_record(%s) -> %s" % (record_id, rec["error"]))
            break
        depth += 1
        print("   get_record -> %s  [%s]" % (brief(rec), verify(rec, KEYS)))
        record_id = rec.get("supersedes")
    print("   chain depth:", depth)
    return req_id


KEYS = json.load(urllib.request.urlopen(urllib.request.Request(KEYRING, headers={"User-Agent": UA}), timeout=60))["keys"]

print("1 resolve_compliance(%s, %s)" % (OBJECT_ID, JURIS))
rec = call("resolve_compliance", {"object_id": OBJECT_ID, "jurisdiction": JURIS}, 1)
if "error" in rec:
    print("   ->", rec["error"])
    raise SystemExit(1)
print("   ->", brief(rec))
print("   issuer", rec["issuer"]["name"], "| rail", rec["issuer"]["rail"], "| key_id", rec["key_id"], "| case_study", rec.get("case_study"))
print("2 verify against", KEYRING, "->", verify(rec, KEYS))
print("3 get_record down the supersedes chain from", rec["record_id"])
nxt = walk_chain(rec["record_id"], 2)
print("4 the rail's one supersession pair, for the shape:", CHAIN_DEMO)
walk_chain(CHAIN_DEMO, nxt)
