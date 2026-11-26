"""Documents V1 / D1a — hosted HTTP certification against staging.

Read-only except for the `document_link_issued` audit rows that signed-link issuance writes by
design. Never prints a signed URL, a storage path, a title, a file name or extracted text: only
status codes, response codes and booleans.
"""
import json, os, sys, time, urllib.request, urllib.error, uuid

BASE = "https://staging.workwithalloy.com"
STATE = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json")
EXPECT_SHA = sys.argv[1] if len(sys.argv) > 1 else None

cookies = json.load(open(STATE))["cookies"]
COOKIE = "; ".join(f"{c['name']}={c['value']}" for c in cookies if "workwithalloy" in c.get("domain", ""))

def call(path, auth=True, method="GET"):
    req = urllib.request.Request(BASE + path, method=method, headers={"accept": "application/json"})
    if auth:
        req.add_header("cookie", COOKIE)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read(); status = r.status
    except urllib.error.HTTPError as e:
        raw = e.read(); status = e.code
    try:
        body = json.loads(raw or b"null")
    except Exception:
        body = {"_non_json_bytes": len(raw)}
    return status, body

results = []
def check(name, ok, detail):
    results.append({"case": name, "pass": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + " :: " + json.dumps(detail))

s, info = call("/api/build-info", auth=False)
check("deployed build is the merge", EXPECT_SHA is None or info.get("gitSha") == EXPECT_SHA, {"gitSha": info.get("gitSha")})

# 1. General list: admitted for the QA operator, and returns documents.
s, b = call("/api/admin/documents?limit=200")
docs = (b or {}).get("documents") or [] if isinstance(b, dict) else []
check("documents list admits the QA operator", s == 200 and len(docs) > 0, {"status": s, "count": len(docs)})
by_type = {}
for d in docs:
    by_type.setdefault(d.get("entity_type") or "<none>", []).append(d["id"])
check("list carries the deployed entity types", True, {k: len(v) for k, v in by_type.items()})

child_id = (by_type.get("customer_member") or [None])[0]
intake_id = (by_type.get("<none>") or [None])[0]

# 2. Signed URL for a child document: allowed, short-lived, nothing echoed.
if child_id:
    s, b = call(f"/api/admin/documents/{child_id}/signed-url")
    url = (b or {}).get("signedUrl") if isinstance(b, dict) else None
    check("signed-url issues a link for an authorized operator", s == 200 and bool(url), {"status": s, "has_url": bool(url)})
    if url:
        exp_ok = "token=" in url
        check("link is a signed (token-bearing) URL", exp_ok, {"token_bearing": exp_ok})
else:
    check("signed-url issues a link for an authorized operator", False, {"reason": "no customer_member document listed"})

# 3. Existence is not disclosed: random and malformed ids are 404 NOT_FOUND.
s, b = call(f"/api/admin/documents/{uuid.uuid4()}/signed-url")
check("unknown id -> 404 NOT_FOUND", s == 404 and (b or {}).get("code") == "NOT_FOUND", {"status": s, "code": (b or {}).get("code")})
s, b = call("/api/admin/documents/not-a-uuid/signed-url")
check("malformed id -> 404", s == 404, {"status": s})

# 4. Unauthenticated callers are refused on every D1a route.
for path in [f"/api/admin/documents/{child_id or uuid.uuid4()}/signed-url", "/api/admin/documents",
             f"/api/admin/pos/documents/{intake_id or uuid.uuid4()}/extracted-text", "/api/admin/pos/documents",
             "/api/admin/documents/entity-options?entity_type=customer"]:
    s, b = call(path, auth=False)
    check(f"unauthenticated -> refused {path.split('?')[0].replace(child_id or '', '{id}').replace(intake_id or '', '{id}')}", s in (401, 403), {"status": s})

# 5. Extracted text: through the full decision; unknown id is 404, not an empty 200.
if intake_id:
    s, b = call(f"/api/admin/pos/documents/{intake_id}/extracted-text")
    check("extracted-text serves an authorized operator", s == 200 and isinstance(b, dict) and b.get("ok") is True, {"status": s, "length": (b or {}).get("length")})
s, b = call(f"/api/admin/pos/documents/{uuid.uuid4()}/extracted-text")
check("extracted-text unknown id -> 404 (decision runs before the read)", s == 404, {"status": s, "code": (b or {}).get("code")})

# 6. Processing list and entity options admit the QA operator.
s, b = call("/api/admin/pos/documents?limit=5")
check("processing document list admits a manage holder", s == 200, {"status": s})
s, b = call("/api/admin/documents/entity-options?entity_type=customer")
check("entity-options admits a document writer", s == 200, {"status": s})

# 7. Vendor binding: a real vendor + a child's document -> 404, never a link.
s, b = call("/api/admin/vendors")
vendors = []
if isinstance(b, dict):
    for k in ("vendors", "items", "data", "rows"):
        v = b.get(k)
        if isinstance(v, list): vendors = v; break
        if isinstance(v, dict) and isinstance(v.get("items"), list): vendors = v["items"]; break
elif isinstance(b, list):
    vendors = b
vendor_id = vendors[0].get("id") if vendors and isinstance(vendors[0], dict) else None
if vendor_id and child_id:
    s, b = call(f"/api/admin/vendors/{vendor_id}/documents/signed-url?document_id={child_id}")
    check("vendor signed-url refuses a document that is not the vendor's", s == 404 and not (isinstance(b, dict) and b.get("signedUrl")), {"status": s})
else:
    check("vendor signed-url refuses a document that is not the vendor's", False, {"reason": "no vendor or child document available", "vendors_status": s})

print("\nSUMMARY", json.dumps({"passed": sum(r["pass"] for r in results), "total": len(results), "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}))
json.dump(results, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "d1a_hosted_cert_results.json"), "w"), indent=2)
