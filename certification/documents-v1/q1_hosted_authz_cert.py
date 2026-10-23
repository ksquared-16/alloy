"""Documents Q1 / D1a — hosted persona authorization certification against staging (authz_q1).

Usage: q1_hosted_authz_cert.py <qa_run_id> setup|certify|teardown

Every request is real HTTP from the persona's own run-scoped session, read from
  <authRoot>/qa-runs/<qa_run_id>/<persona>/storage-state.json
written by environment.qa_run_open. Never prints a cookie, signed URL, storage path or extracted
text: only status codes, response codes, counts and booleans.

setup    uploads the contract §5 product-API fixtures (tag qa-authz-<qa_run_id> in title and file name)
certify  runs the persona matrix and writes q1_hosted_authz_cert_results.json
teardown deletes every uploaded document through DELETE /api/admin/pos/documents/[id] (audited)
"""
import json, os, sys, time, urllib.request, urllib.error, uuid

BASE = "https://staging.workwithalloy.com"
AUTH = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.path.dirname(os.path.abspath(__file__))
RUN = sys.argv[1]
PHASE = sys.argv[2]
TAG = f"qa-authz-{RUN}"
STATE_FILE = os.path.join(HERE, f"q1_hosted_fixture_ids.{RUN}.json")

OPP1 = "aa000000-0000-4000-8000-000000000111"  # WU1 in QA D1 (in scope for scoped_ops)
OPP2 = "aa000000-0000-4000-8000-000000000112"  # WU2 in QA D2 (out of scope)
OPPX = "aa000000-0000-4000-8000-000000000211"  # QA Secondary subject
V1 = "aa000000-0000-4000-8000-000000000001"
V2 = "aa000000-0000-4000-8000-000000000002"

PERSONAS = ["fixture_admin", "doc_reader", "no_docs", "processing_only", "ocr", "scoped_ops", "cross_org_admin"]
_cookies = {}


def cookie(p):
    if p not in _cookies:
        st = json.load(open(os.path.join(AUTH, RUN, p, "storage-state.json")))
        _cookies[p] = "; ".join(f"{c['name']}={c['value']}" for c in st["cookies"] if "workwithalloy" in c.get("domain", ""))
    return _cookies[p]


def call(path, persona=None, method="GET", body=None, ctype=None):
    h = {"accept": "application/json"}
    if persona:
        h["cookie"] = cookie(persona)
    if method != "GET":
        h["origin"] = BASE
        h["referer"] = BASE + "/admin"
    if ctype:
        h["content-type"] = ctype
    req = urllib.request.Request(BASE + path, method=method, headers=h, data=body)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw, status = r.read(), r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read(), e.code
    try:
        b = json.loads(raw or b"null")
    except Exception:
        b = {"_non_json_bytes": len(raw)}
    return status, b


def code_of(b):
    return b.get("code") if isinstance(b, dict) else None


def tiny_pdf(label):
    text = f"QA authz fixture {label}"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        None,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    stream = f"BT /F1 10 Tf 10 50 Td ({text}) Tj ET"
    objs[3] = f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream"
    out, offs = "%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n"
    x = len(out)
    out += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offs)
    out += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n"
    return out.encode()


def multipart(fields, filename, content, mime):
    b = "----qaauthz" + uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + content + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={b}"


def upload(persona, key, fields, ext="pdf"):
    name = f"{TAG}-{key}.{ext}"
    if ext == "pdf":
        content, mime = tiny_pdf(key), "application/pdf"
    else:
        content, mime = f"QA authz intake fixture {key}. Synthetic text for OCR preview.\n".encode(), "text/plain"
    body, ct = multipart({**fields, "title": f"{TAG} {key}"}, name, content, mime)
    return call("/api/admin/documents/upload", persona, "POST", body, ct)


results = []


def check(case, persona, ok, status, code=None, **extra):
    results.append({"case": case, "persona": persona, "pass": bool(ok), "status": status, "code": code, **extra})
    print(("PASS " if ok else "FAIL ") + f"[{persona}] {case} :: status={status} code={code}" + (f" {json.dumps(extra)}" if extra else ""))


if PHASE == "setup":
    ids = json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {}
    plan = [
        ("wu1", "fixture_admin", {"entity_type": "opportunity", "entity_id": OPP1, "doc_type": "other"}, "pdf"),
        ("wu2", "fixture_admin", {"entity_type": "opportunity", "entity_id": OPP2, "doc_type": "other"}, "pdf"),
        ("v1", "fixture_admin", {"entity_type": "vendor", "entity_id": V1, "doc_type": "other"}, "pdf"),
        ("intake", "fixture_admin", {"open_processing_case": "true"}, "txt"),
        ("x", "cross_org_admin", {"entity_type": "opportunity", "entity_id": OPPX, "doc_type": "other"}, "pdf"),
    ]
    for key, persona, fields, ext in plan:
        if key in ids:
            print(f"skip {key}: already uploaded")
            continue
        s, b = upload(persona, key, fields, ext)
        doc = (b or {}).get("document") if isinstance(b, dict) else None
        did = doc.get("id") if isinstance(doc, dict) else None
        print(f"upload {key} as {persona}: status={s} code={code_of(b)} has_id={bool(did)} processing_case={bool((b or {}).get('processing_case_id')) if isinstance(b, dict) else None}")
        if did:
            ids[key] = {"id": did, "owner": persona, "processing_case": bool((b or {}).get("processing_case_id"))}
            json.dump(ids, open(STATE_FILE, "w"), indent=2)
    print("SETUP", json.dumps({k: bool(v) for k, v in ids.items()}))
    sys.exit(0 if len(ids) == len(plan) else 1)

if PHASE == "teardown":
    ids = json.load(open(STATE_FILE))
    # Any extra tagged document (e.g. a refused upload that was wrongly admitted) is found by listing.
    for owner in ("fixture_admin", "cross_org_admin"):
        s, b = call("/api/admin/documents?limit=200", owner)
        for d in (b or {}).get("documents") or []:
            if TAG in json.dumps(d) and d.get("id") not in [v["id"] for v in ids.values()]:
                ids[f"extra_{d['id'][:8]}"] = {"id": d["id"], "owner": owner}
    ok_all = True
    for key, v in ids.items():
        s, b = call(f"/api/admin/pos/documents/{v['id']}", v["owner"], "DELETE")
        data = (b or {}).get("data") if isinstance(b, dict) else None
        deleted = isinstance(data, dict) and data.get("deleted") is True
        s2, _ = call(f"/api/admin/documents/{v['id']}/signed-url", v["owner"])
        gone = s2 == 404 or (s == 404)
        ok_all &= (deleted or s == 404) and gone
        print(f"delete {key} as {v['owner']}: status={s} deleted={deleted} removed_cases={(data or {}).get('removed_cases') if isinstance(data, dict) else None} after_signed_url={s2}")
    print("TEARDOWN", json.dumps({"ok": bool(ok_all), "count": len(ids)}))
    sys.exit(0 if ok_all else 1)

# ---------------- certify ----------------
ids = {k: v["id"] for k, v in json.load(open(STATE_FILE)).items()}
WU1, WU2, VD, INT, XD = ids["wu1"], ids["wu2"], ids["v1"], ids["intake"], ids["x"]
DOCS = {"wu1": WU1, "wu2": WU2, "v1": VD, "intake": INT, "x": XD}

s, info = call("/api/build-info")
check("deployed build", None, s == 200, s, sha=(info or {}).get("gitSha"), project=(info or {}).get("supabaseProjectRef"))

# Expected signed-url outcome per persona and document: 200 = link issued, 404 = not found (scope/org),
# 403 = refused before the row is read (INSUFFICIENT_ROLE).
A, N, F = 200, 404, 403
EXPECT = {
    "doc_reader":      {"wu1": A, "wu2": A, "v1": A, "intake": A, "x": N},
    "ocr":             {"wu1": A, "wu2": A, "v1": A, "intake": A, "x": N},
    "no_docs":         {"wu1": F, "wu2": F, "v1": F, "intake": F, "x": F},
    "processing_only": {"wu1": F, "wu2": F, "v1": F, "intake": F, "x": F},
    "scoped_ops":      {"wu1": A, "wu2": N, "v1": N, "intake": N, "x": N},
    "cross_org_admin": {"wu1": N, "wu2": N, "v1": N, "intake": N, "x": A},
    "fixture_admin":   {"wu1": A, "wu2": A, "v1": A, "intake": A, "x": N},
}
for p, row in EXPECT.items():
    for k, exp in row.items():
        s, b = call(f"/api/admin/documents/{DOCS[k]}/signed-url", p)
        has_url = isinstance(b, dict) and bool(b.get("signedUrl"))
        ok = s == exp and (has_url if exp == A else not has_url)
        if exp == F:
            ok = ok and code_of(b) == "INSUFFICIENT_ROLE"
        if exp == N:
            ok = ok and code_of(b) == "NOT_FOUND"
        check(f"signed-url {k} expect {exp}", p, ok, s, code_of(b), has_url=has_url)

# General list: admission and scope filtering (ids only, compared to the run's own fixtures).
LIST = {
    "doc_reader": (200, {"wu1", "wu2", "v1", "intake"}),
    "ocr": (200, {"wu1", "wu2", "v1", "intake"}),
    "scoped_ops": (200, {"wu1"}),
    "no_docs": (403, set()),
    "processing_only": (403, set()),
    "cross_org_admin": (200, {"x"}),
}
for p, (exp, visible) in LIST.items():
    s, b = call("/api/admin/documents?limit=200", p)
    got = {(d or {}).get("id") for d in ((b or {}).get("documents") or [])} if isinstance(b, dict) else set()
    seen = {k for k, v in DOCS.items() if v in got}
    check("documents list", p, s == exp and seen == visible, s, code_of(b), fixtures_visible=sorted(seen), expected=sorted(visible))

# OCR / extracted text: processing.operate first, then the full document decision.
EXT = {"ocr": 200, "doc_reader": 403, "no_docs": 403, "processing_only": 403, "scoped_ops": 404, "cross_org_admin": 404}
for p, exp in EXT.items():
    s, b = call(f"/api/admin/pos/documents/{INT}/extracted-text", p)
    ok = s == exp and (isinstance(b, dict) and b.get("ok") is True and (b.get("length") or 0) > 0 if exp == 200 else True)
    check(f"extracted-text intake expect {exp}", p, ok, s, code_of(b), length=(b or {}).get("length") if isinstance(b, dict) else None)

# Source preview (text) for the intake document.
PREV = {"ocr": 200, "doc_reader": 200, "no_docs": 403, "processing_only": 403, "scoped_ops": 404, "cross_org_admin": 404}
for p, exp in PREV.items():
    s, b = call(f"/api/admin/documents/{INT}/source-preview", p)
    check(f"source-preview intake expect {exp}", p, s == exp, s, code_of(b))

# Processing document list requires processing.documents.manage (no pool persona holds it).
for p, exp in {"fixture_admin": 200, "ocr": 403, "processing_only": 403, "doc_reader": 403, "no_docs": 403, "scoped_ops": 403, "cross_org_admin": 200}.items():
    s, b = call("/api/admin/pos/documents?limit=200", p)
    extra = {}
    if s == 200 and isinstance(b, dict):
        rows = b.get("documents") or (b.get("data") or {}).get("documents") or []
        got = {(r or {}).get("id") or (r or {}).get("document_id") for r in rows}
        extra["foreign_fixtures_visible"] = sorted(k for k, v in DOCS.items() if v in got and ((k == "x") != (p == "cross_org_admin")))
    ok = s == exp and not extra.get("foreign_fixtures_visible")
    check(f"pos documents list expect {exp}", p, ok, s, code_of(b), **extra)

# Vendor-bound signed URL: only the vendor's own document, only in the vendor's org.
for p, vid, did, exp in [
    ("doc_reader", V1, VD, 200),
    ("doc_reader", V1, WU1, 404),
    ("doc_reader", V2, VD, 404),
    ("scoped_ops", V1, VD, 404),
    ("cross_org_admin", V1, VD, 404),
    ("cross_org_admin", V1, XD, 404),
]:
    s, b = call(f"/api/admin/vendors/{vid}/documents/signed-url?document_id={did}", p)
    has_url = isinstance(b, dict) and bool(b.get("signedUrl"))
    check(f"vendor signed-url {'V1' if vid == V1 else 'V2'}/{[k for k, v in DOCS.items() if v == did][0]} expect {exp}", p, s == exp and has_url == (exp == 200), s, code_of(b), has_url=has_url)
for p in ("no_docs", "processing_only"):
    s, b = call(f"/api/admin/vendors/{V1}/documents/signed-url?document_id={VD}", p)
    has_url = isinstance(b, dict) and bool(b.get("signedUrl"))
    check("vendor signed-url V1/v1 refused", p, s in (403, 404) and not has_url, s, code_of(b), has_url=has_url)

# Writes are refused before anything is stored.
for p in ("doc_reader", "no_docs", "processing_only", "ocr", "scoped_ops"):
    s, b = upload(p, f"refused-{p}", {"entity_type": "opportunity", "entity_id": OPP1, "doc_type": "other"})
    stored = isinstance(b, dict) and isinstance(b.get("document"), dict)
    check("upload refused (no documents.write)", p, s == 403 and not stored, s, code_of(b), stored=stored)
s, b = call("/api/admin/documents/entity-options?entity_type=opportunity", "doc_reader")
check("entity-options refused (no documents.write)", "doc_reader", s == 403, s, code_of(b))
s, b = call("/api/admin/documents/entity-options?entity_type=opportunity", "fixture_admin")
check("entity-options admits a writer", "fixture_admin", s == 200, s, code_of(b))

# Deletes: only processing.documents.manage, only in the caller's org.
for p, did, exp in [("doc_reader", WU1, 403), ("ocr", WU1, 403), ("scoped_ops", WU1, 403), ("cross_org_admin", WU1, 404), ("fixture_admin", XD, 404)]:
    s, b = call(f"/api/admin/pos/documents/{did}", p, "DELETE")
    check(f"delete refused expect {exp}", p, s == exp, s, code_of(b))
# The refused deletes changed nothing: owners still reach their documents.
for k, owner in (("wu1", "fixture_admin"), ("x", "cross_org_admin")):
    s, b = call(f"/api/admin/documents/{DOCS[k]}/signed-url", owner)
    check(f"{k} intact after refused deletes", owner, s == 200, s, code_of(b))

# Existence is not disclosed; unauthenticated callers are refused.
s, b = call(f"/api/admin/documents/{uuid.uuid4()}/signed-url", "doc_reader")
check("unknown id -> 404", "doc_reader", s == 404 and code_of(b) == "NOT_FOUND", s, code_of(b))
s, b = call("/api/admin/documents/not-a-uuid/signed-url", "doc_reader")
check("malformed id -> 404", "doc_reader", s == 404, s, code_of(b))
for path in [f"/api/admin/documents/{WU1}/signed-url", "/api/admin/documents", f"/api/admin/pos/documents/{INT}/extracted-text",
             "/api/admin/pos/documents", f"/api/admin/documents/{INT}/source-preview"]:
    s, b = call(path)
    check("unauthenticated refused " + path.replace(WU1, "{wu1}").replace(INT, "{intake}"), None, s in (401, 403), s, code_of(b))

summary = {"passed": sum(r["pass"] for r in results), "total": len(results), "qa_run_id": RUN, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
print("\nSUMMARY", json.dumps(summary))
json.dump({"summary": summary, "results": results}, open(os.path.join(HERE, "q1_hosted_authz_cert_results.json"), "w"), indent=2)
