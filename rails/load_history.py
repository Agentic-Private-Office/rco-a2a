r"""RCO-01 step 5 — load the ledger-era receipts into D1 as the chain's first block. Inputs: REGISTER\raw\ledger-receipts.json (every receipt-kind
entry on gsc-rco-ledger subledger:0, read 2026-10-29: txn · decision_id · writer · hash) and REGISTER\raw\lodged-times.json (the door's console
'receipt lodged' lines: id · txn · t). Output: DOOR\rails\history\NNN.sql, INSERTs in ledger order with the new chain hash computed from row 1
(genesis sha256:000…0), one spec with worker/chain.js. Fields the wire never held (gtin, market, actor_class, rule_version) stay NULL — never typed.
writer = the ledger's own value (25,706 'allooloo'; the 26 gate_ rows carry none). kid = gsc-rco-2026-08 on every original, sig NULL, ledger_txn and
ledger_hash kept. cleared_at = the lodge time from the console log where the log window holds it, else NULL. Idempotent re-lodges (same decision_id)
load once, first occurrence. Run: python -I load_history.py  → prints count, first, last, tip hash; then rails/d1_up.sh executes the SQL files."""
import json, hashlib, os, collections
RAW = r'C:\MATTHEWKEDDY\RCO\REGISTER\raw'; OUT = r'C:\MATTHEWKEDDY\RCO\DOOR\rails\history'; os.makedirs(OUT, exist_ok=True)
led = json.load(open(os.path.join(RAW, 'ledger-receipts.json'), encoding='utf-8'))
times = {}
tp = os.path.join(RAW, 'lodged-times.json')
if os.path.exists(tp) and os.path.getsize(tp) > 2:
    for r in json.load(open(tp, encoding='utf-8')):
        i = (r.get('id') or '').strip(); t = r.get('t')
        if i and t and i not in times: times[i] = t[:23].rstrip('0').rstrip('.') + 'Z' if '.' in t else t.replace('+00:00', 'Z')
CHAINED = ["actor_class", "cleared_at", "decision_id", "gtin", "market", "prev_hash", "rule_version", "writer"]
canon = lambda row: json.dumps({k: row.get(k) for k in CHAINED}, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
H = lambda row: 'sha256:' + hashlib.sha256(canon(row).encode('utf-8')).hexdigest()
q = lambda v: 'NULL' if v is None else "'" + str(v).replace("'", "''") + "'"
seen, rows, prev, dups = set(), [], 'sha256:' + '0' * 64, 0
for e in sorted(led, key=lambda x: tuple(int(p) for p in x['txn'].split('.'))):
    d = e['decision_id']
    if d in seen: dups += 1; continue
    seen.add(d)
    row = {'decision_id': d, 'gtin': None, 'market': None, 'actor_class': None, 'rule_version': None, 'cleared_at': times.get(d), 'writer': e.get('writer'), 'prev_hash': prev}
    row['hash'] = H(row); row['sig'] = None; row['kid'] = 'gsc-rco-2026-08'; row['ledger_txn'] = e['txn']; row['ledger_hash'] = e.get('hash')
    rows.append(row); prev = row['hash']
N = 2000
for i in range(0, len(rows), N):
    chunk = rows[i:i + N]
    with open(os.path.join(OUT, f'{i // N:03d}.sql'), 'w', encoding='utf-8') as f:
        f.write('INSERT INTO receipts (decision_id,gtin,market,actor_class,rule_version,cleared_at,writer,prev_hash,hash,sig,kid,ledger_txn,ledger_hash) VALUES\n')
        f.write(',\n'.join('(' + ','.join(q(r[k]) for k in ['decision_id', 'gtin', 'market', 'actor_class', 'rule_version', 'cleared_at', 'writer', 'prev_hash', 'hash', 'sig', 'kid', 'ledger_txn', 'ledger_hash']) + ')' for r in chunk) + ';\n')
json.dump({'rows': len(rows), 'ledger_entries': len(led), 'duplicates_skipped': dups, 'with_cleared_at': sum(1 for r in rows if r['cleared_at']), 'writers': dict(collections.Counter(str(r['writer']) for r in rows)),
           'first': {k: rows[0][k] for k in ['decision_id', 'ledger_txn', 'cleared_at', 'writer']}, 'last': {k: rows[-1][k] for k in ['decision_id', 'ledger_txn', 'cleared_at', 'writer']}, 'tip_hash': rows[-1]['hash'], 'files': (len(rows) + N - 1) // N},
          open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8'), indent=1)
print(json.dumps(json.load(open(os.path.join(OUT, 'manifest.json'))), indent=1))
