"""get_receipt.py — read one RCO receipt (the Record of Cleared Orders) from the live door and print it. Python 3 standard library only.
Usage: python examples/get_receipt.py <decision_id>"""
import sys, json, urllib.request

DOOR = "https://mcp.rco-a2a.ai/mcp"
decision_id = sys.argv[1] if len(sys.argv) > 1 else "gate_dec1d9aaa478b3ef94e4"
body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_receipt", "arguments": {"decision_id": decision_id}}}
req = urllib.request.Request(DOOR, data=json.dumps(body).encode(), headers={"content-type": "application/json", "accept": "application/json, text/event-stream", "user-agent": "rco-a2a-example/2"})
raw = urllib.request.urlopen(req, timeout=30).read().decode()
answer = json.loads(raw[raw.index("{"):])
receipt = answer["result"].get("structuredContent") or json.loads(answer["result"]["content"][0]["text"])
print(json.dumps(receipt, indent=2, ensure_ascii=False))
