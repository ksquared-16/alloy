"""Documents V1 / D1b.7 — hosted security certification against staging (authz_q1 personas).

Usage: d1b_hosted_security_cert.py <qa_run_id> setup|certify|lead_delete|teardown

Runs alongside the certified Q1 driver (q1_hosted_authz_cert.py), which owns the five Q1 fixture
documents and the positive server-side regression matrix. This driver adds what D1b changed:
  * a MEDICAL document (immunization_record) on a child of an in-scope household: refused without health.view.
    Since D5 enforces each Studio type's applicable subjects, a medical type is child-only, so this driver owns a
    run-scoped household (create_lead in WU1 / QA D1, one child) and removes it with the audited lead deletion.
    A child has no department/site linkage, so a scope-restricted actor is refused it by scope (404) before the
    sensitivity check is reached. The restricted-actor half of D1b.6 — in scope, and still refused without
    health.view — is held by a second document on in-scope OPP1 whose DECLARED class is raised to medical;
  * content proven by bytes: a PNG named .pdf is refused and nothing is stored;
  * the record drawer: never OCR text, and no drawer for an actor without document read;
  * OCR text in a Processing case's stored form-draft preview: only for an actor who may read it;
  * public ingestion: Content-Length precheck and per-caller rate limits, before any token or body.

Requests are real HTTP from each persona's own run-scoped session. Never prints a cookie, signed URL,
storage path, title, file name or extracted text: only status codes, response codes, counts and
booleans. Public-upload probes send no valid token and no valid file, so they can write nothing.
"""
import json, os, sys, time, urllib.request, urllib.error, uuid

BASE = "https://staging.workwithalloy.com"
AUTH = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.path.dirname(os.path.abspath(__file__))
RUN = sys.argv[1]
PHASE = sys.argv[2]
TAG = f"qa-authz-{RUN}"
Q1_IDS = os.path.join(HERE, f"q1_hosted_fixture_ids.{RUN}.json")
STATE_FILE = os.path.join(HERE, f"d1b_hosted_fixture_ids.{RUN}.json")
OPP1 = "aa000000-0000-4000-8000-000000000111"
WU1_UNIT = "aa000000-0000-4000-8000-000000000101"  # QA D1 (in scope for scoped_ops)
HOUSEHOLD_FILE = os.path.join(HERE, f"d1b_hosted_household.{RUN}.json")
_cookies = {}


def cookie(p):
    if p not in _cookies:
        st = json.load(open(os.path.join(AUTH, RUN, p, "storage-state.json")))
        _cookies[p] = "; ".join(f"{c['name']}={c['value']}" for c in st["cookies"] if "workwithalloy" in c.get("domain", ""))
    return _cookies[p]


def call(path, persona=None, method="GET", body=None, ctype=None, headers=None):
    h = {"accept": "application/json"}
    if persona:
        h["cookie"] = cookie(persona)
    if method != "GET":
        h["origin"] = BASE
        h["referer"] = BASE + "/admin"
    if ctype:
        h["content-type"] = ctype
    h.update(headers or {})
    req = urllib.request.Request(BASE + path, method=method, headers=h, data=body)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
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
    text = f"QA authz D1b fixture {label}"
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            None, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
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


PNG_BYTES = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) + b"\x00" * 64


def multipart(fields, filename, content, mime):
    b = "----qaauthzd1b" + uuid.uuid4().hex
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()]
    if filename is not None:
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + content + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={b}"


def upload(persona, key, fields, content, filename_ext, mime):
    body, ct = multipart({**fields, "title": f"{TAG} {key}"}, f"{TAG}-{key}.{filename_ext}", content, mime)
    return call("/api/admin/documents/upload", persona, "POST", body, ct)


results = []


def check(case, persona, ok, status, code=None, **extra):
    results.append({"case": case, "persona": persona, "pass": bool(ok), "status": status, "code": code, **extra})
    print(("PASS " if ok else "FAIL ") + f"[{persona}] {case} :: status={status} code={code}" + (f" {json.dumps(extra)}" if extra else ""))


if PHASE == "setup":
    ids = json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {}
    hh = json.load(open(HOUSEHOLD_FILE)) if os.path.exists(HOUSEHOLD_FILE) else {}
    if "opportunity" not in hh:
        s, b = call("/api/admin/actions/execute", "fixture_admin", "POST", json.dumps({
            "action_key": "create_lead", "entity_type": "opportunity", "mode": "execute",
            "payload": {"first_name": "QA D1b Adult", "last_name": RUN.split("_", 1)[1], "email": f"qa-d1b-{RUN.split('_', 1)[1]}-a1@example.com"},
            "context": {"work_unit_id": WU1_UNIT, "surface": "work_unit"},
        }).encode(), "application/json")
        data = (b or {}).get("data") or {} if isinstance(b, dict) else {}
        er = data.get("execution_result") or {}
        detail = er.get("detail") or {} if isinstance(er, dict) else {}
        opp = data.get("affected_id") or detail.get("opportunity_id") or (er.get("affectedId") if isinstance(er, dict) else None)
        print(f"create_lead: status={s} code={code_of(b)} has_opp={bool(opp)}")
        if not opp:
            sys.exit(1)
        hh["opportunity"] = opp
        json.dump(hh, open(HOUSEHOLD_FILE, "w"), indent=2)
    if "child" not in hh:
        s, b = call(f"/api/admin/documents/library?subject_type=opportunity&subject_id={hh['opportunity']}", "fixture_admin")
        household = (((b or {}).get("library") or {}).get("household") or {}).get("id") if isinstance(b, dict) else None
        if not household:
            print(f"library(case): status={s} household=False")
            sys.exit(1)
        s, b = call("/api/admin/customer-members", "fixture_admin", "POST", json.dumps({
            "customer_id": household, "display_name": f"QA D1b Kid {RUN.split('_', 1)[1]}", "relationship": "child",
            "first_name": "QA D1b Kid", "last_name": RUN.split("_", 1)[1],
        }).encode(), "application/json")
        row = ((b or {}).get("member") or (b or {}).get("row") or (b or {}).get("data") or b) if isinstance(b, dict) else {}
        if isinstance(row, dict) and isinstance(row.get("member"), dict):
            row = row["member"]
        mid = row.get("id") if isinstance(row, dict) else None
        print(f"customer-member child: status={s} code={code_of(b)} has_id={bool(mid)}")
        if not mid:
            sys.exit(1)
        hh["child"] = mid
        json.dump(hh, open(HOUSEHOLD_FILE, "w"), indent=2)
    if "medical" not in ids:
        s, b = upload("fixture_admin", "medical", {"entity_type": "customer_member", "entity_id": hh["child"], "doc_type": "immunization_record"},
                      tiny_pdf("medical"), "pdf", "application/pdf")
        did = ((b or {}).get("document") or {}).get("id") if isinstance(b, dict) else None
        print(f"upload medical as fixture_admin: status={s} code={code_of(b)} has_id={bool(did)}")
        if did:
            ids["medical"] = {"id": did, "owner": "fixture_admin"}
            json.dump(ids, open(STATE_FILE, "w"), indent=2)
    if "medical_declared" not in ids:
        s, b = upload("fixture_admin", "medical-declared", {"entity_type": "opportunity", "entity_id": OPP1, "doc_type": "other"},
                      tiny_pdf("medical-declared"), "pdf", "application/pdf")
        did = ((b or {}).get("document") or {}).get("id") if isinstance(b, dict) else None
        print(f"upload medical-declared as fixture_admin: status={s} code={code_of(b)} has_id={bool(did)}")
        if did:
            ids["medical_declared"] = {"id": did, "owner": "fixture_admin"}
            json.dump(ids, open(STATE_FILE, "w"), indent=2)
    if "medical_declared" in ids and not ids["medical_declared"].get("raised"):
        s, b = call(f"/api/admin/documents/{ids['medical_declared']['id']}/sensitivity", "fixture_admin", "POST",
                    json.dumps({"sensitivity": "medical", "reason": "D1b hosted certification: in-scope medical class"}).encode(), "application/json")
        raised = s == 200 and isinstance(b, dict) and b.get("sensitivity") == "medical"
        print(f"raise medical-declared to medical: status={s} code={code_of(b)} raised={raised}")
        ids["medical_declared"]["raised"] = raised
        json.dump(ids, open(STATE_FILE, "w"), indent=2)
    print("SETUP", json.dumps({k: True for k in ids}))
    sys.exit(0 if "medical" in ids and (ids.get("medical_declared") or {}).get("raised") else 1)

if PHASE == "lead_delete":
    # The lead-deletion repair (PR #1579), on the deployed build. fixture_admin deletes QA fixture opportunity OPP2
    # through the real product route. Its documents (the Q1 wu2 upload, plus one uploaded here) must be disposed of
    # WITH their stored files. The zero-residue census after the close proves no qa-authz object remains. The teardown
    # cannot mask a leftover object here: it deletes only documents whose row still exists.
    OPP2 = "aa000000-0000-4000-8000-000000000112"
    q1 = json.load(open(Q1_IDS))
    s, b = upload("fixture_admin", "lead-owned", {"entity_type": "opportunity", "entity_id": OPP2, "doc_type": "other"},
                  tiny_pdf("lead-owned"), "pdf", "application/pdf")
    own = ((b or {}).get("document") or {}).get("id") if isinstance(b, dict) else None
    check("upload a document owned only by the lead", "fixture_admin", s == 200 and bool(own), s, code_of(b))
    targets = [x for x in (own, q1["wu2"]["id"]) if x]
    s, b = call(f"/api/admin/opportunities/{OPP2}/delete", "fixture_admin", "POST", b"{}", "application/json")
    result = (b or {}).get("result") if isinstance(b, dict) else None
    disp = {d.get("documentId"): d for d in ((result or {}).get("documents") or [])}
    check("lead deletion succeeds", "fixture_admin", s == 200 and isinstance(result, dict), s, code_of(b),
          documents_deleted=(result or {}).get("deleted", {}).get("documents"), documents_retained=(result or {}).get("deleted", {}).get("documents_retained"))
    for t in targets:
        d = disp.get(t) or {}
        check("lead's document deleted with its stored file", "fixture_admin",
              d.get("outcome") == "deleted" and (d.get("objectsRemoved") or 0) >= 1, s, None,
              outcome=d.get("outcome"), objects_removed=d.get("objectsRemoved"), objects_already_absent=d.get("objectsAlreadyAbsent"))
        s2, b2 = call(f"/api/admin/documents/{t}/signed-url", "fixture_admin")
        check("deleted document is unreachable", "fixture_admin", s2 == 404, s2, code_of(b2))
    s3, b3 = call(f"/api/admin/documents/{q1['wu1']['id']}/signed-url", "fixture_admin")
    check("another lead's document is untouched", "fixture_admin", s3 == 200, s3, code_of(b3))
    summary = {"passed": sum(r["pass"] for r in results), "total": len(results), "qa_run_id": RUN, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    print("\nSUMMARY", json.dumps(summary))
    json.dump({"summary": summary, "results": results}, open(os.path.join(HERE, f"d1b_lead_delete_results.{RUN}.json"), "w"), indent=2)
    sys.exit(0 if summary["passed"] == summary["total"] else 1)

if PHASE == "teardown":
    ids = json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {}
    # Anything else carrying this run's tag that the Q1 driver does not own (e.g. a refused upload that was
    # wrongly admitted) is found by listing and removed here too.
    q1 = {v["id"] for v in json.load(open(Q1_IDS)).values()} if os.path.exists(Q1_IDS) else set()
    s, b = call("/api/admin/documents?limit=200", "fixture_admin")
    for d in (b or {}).get("documents") or []:
        if TAG in json.dumps(d) and d.get("id") not in q1 and d.get("id") not in [v["id"] for v in ids.values()]:
            ids[f"extra_{d['id'][:8]}"] = {"id": d["id"], "owner": "fixture_admin"}
    ok_all = True
    for key, v in ids.items():
        s, b = call(f"/api/admin/pos/documents/{v['id']}", v["owner"], "DELETE")
        data = (b or {}).get("data") if isinstance(b, dict) else None
        deleted = isinstance(data, dict) and data.get("deleted") is True
        s2, _ = call(f"/api/admin/documents/{v['id']}/signed-url", v["owner"])
        ok_all &= (deleted or s == 404) and s2 == 404
        print(f"delete {key} as {v['owner']}: status={s} deleted={deleted} after_signed_url={s2}")
    hh = json.load(open(HOUSEHOLD_FILE)) if os.path.exists(HOUSEHOLD_FILE) else {}
    if hh.get("opportunity"):
        s, b = call(f"/api/admin/opportunities/{hh['opportunity']}/delete", "fixture_admin", "POST", b"{}", "application/json")
        s2, _ = call(f"/api/admin/documents/library?subject_type=opportunity&subject_id={hh['opportunity']}", "fixture_admin")
        ok_all &= s in (200, 404) and s2 == 404
        print(f"lead delete household: status={s} code={code_of(b)} after_library={s2}")
    print("TEARDOWN", json.dumps({"ok": bool(ok_all), "count": len(ids), "household": bool(hh.get("opportunity"))}))
    sys.exit(0 if ok_all else 1)

# ---------------- certify ----------------
q1 = json.load(open(Q1_IDS))
d1b = json.load(open(STATE_FILE))
MED = d1b["medical"]["id"]
MED_DECL = d1b["medical_declared"]["id"]
WU1 = q1["wu1"]["id"]
INT = q1["intake"]["id"]

s, info = call("/api/build-info")
check("deployed build", None, s == 200, s, sha=(info or {}).get("gitSha"), project=(info or {}).get("supabaseProjectRef"))

# 1. Medical documents need health.view (D1b.6). doc_reader / ocr / scoped_ops hold documents.read, not health.view.
# scoped_ops (QA D1 only) gets 404, not 403: the medical document is owned by a child (customer_member), a subject type
# with no department/site linkage, which only an unrestricted-scope actor may read (assertDocumentAccess, fail closed).
for p, exp in {"fixture_admin": 200, "doc_reader": 403, "ocr": 403, "scoped_ops": 404, "no_docs": 403, "cross_org_admin": 404}.items():
    s, b = call(f"/api/admin/documents/{MED}/signed-url", p)
    has_url = isinstance(b, dict) and bool(b.get("signedUrl"))
    want_code = {403: ("SENSITIVE_DOCUMENT" if p != "no_docs" else "INSUFFICIENT_ROLE"), 404: "NOT_FOUND"}.get(exp)
    ok = s == exp and has_url == (exp == 200) and (want_code is None or code_of(b) == want_code)
    check(f"medical signed-url expect {exp}", p, ok, s, code_of(b), has_url=has_url)
for p, visible in {"fixture_admin": True, "doc_reader": False, "ocr": False, "scoped_ops": False}.items():
    s, b = call("/api/admin/documents?limit=200", p)
    got = {(d or {}).get("id") for d in ((b or {}).get("documents") or [])} if isinstance(b, dict) else set()
    check(f"medical listed = {visible}", p, s == 200 and ((MED in got) == visible) and (WU1 in got), s, code_of(b), medical_listed=MED in got)

# 1b. The same refusal for a scope-restricted actor who passes scope. MED_DECL is a standard-type document on OPP1
# (QA D1, inside scoped_ops' scope; WU1 sits on the same subject) whose declared class setup raised to medical.
check("declared medical class raised in setup", "fixture_admin", d1b["medical_declared"].get("raised") is True, None)
for p, exp in {"fixture_admin": 200, "doc_reader": 403, "ocr": 403, "scoped_ops": 403, "no_docs": 403, "cross_org_admin": 404}.items():
    s, b = call(f"/api/admin/documents/{MED_DECL}/signed-url", p)
    has_url = isinstance(b, dict) and bool(b.get("signedUrl"))
    want_code = {403: ("SENSITIVE_DOCUMENT" if p != "no_docs" else "INSUFFICIENT_ROLE"), 404: "NOT_FOUND"}.get(exp)
    ok = s == exp and has_url == (exp == 200) and (want_code is None or code_of(b) == want_code)
    check(f"in-scope declared-medical signed-url expect {exp}", p, ok, s, code_of(b), has_url=has_url)
for p, visible in {"fixture_admin": True, "doc_reader": False, "ocr": False, "scoped_ops": False}.items():
    s, b = call("/api/admin/documents?limit=200", p)
    got = {(d or {}).get("id") for d in ((b or {}).get("documents") or [])} if isinstance(b, dict) else set()
    check(f"in-scope declared-medical listed = {visible}", p, s == 200 and ((MED_DECL in got) == visible) and (WU1 in got), s, code_of(b), medical_listed=MED_DECL in got)
s, b = call(f"/api/admin/entity/documents/{MED_DECL}", "scoped_ops")
check("drawer refuses an in-scope declared-medical document without health.view", "scoped_ops", s == 404, s, code_of(b))

# 2. The record drawer: never OCR text; sensitive and unreadable documents are not served.
s, b = call(f"/api/admin/entity/documents/{INT}", "doc_reader")
body = json.dumps(b)
check("drawer serves the intake document without OCR text", "doc_reader", s == 200 and "extracted_text" not in body and "OCR preview" not in body, s, code_of(b), has_extracted_key="extracted_text" in body)
s, b = call(f"/api/admin/entity/documents/{MED}", "doc_reader")
check("drawer refuses a medical document without health.view", "doc_reader", s == 404, s, code_of(b))
s, b = call(f"/api/admin/entity/documents/{INT}", "processing_only")
check("drawer refuses an actor without document read", "processing_only", s == 404, s, code_of(b))

# 3. Content is proven by bytes: PNG bytes named .pdf are refused, nothing stored.
s, b = upload("fixture_admin", "mismatch", {"entity_type": "opportunity", "entity_id": OPP1, "doc_type": "other"}, PNG_BYTES, "pdf", "application/pdf")
stored = isinstance(b, dict) and isinstance(b.get("document"), dict)
check("upload refuses bytes that are not the claimed format", "fixture_admin", s == 415 and code_of(b) == "CONTENT_MISMATCH" and not stored, s, code_of(b), stored=stored)

# 4. OCR text in a Processing case's stored form-draft preview.
case_id = q1["intake"].get("processing_case_id")
if not case_id:
    s, b = call(f"/api/admin/pos/documents?limit=200", "fixture_admin")
    for d in (b or {}).get("documents") or []:
        if d.get("documentId") == INT and d.get("processingCaseId"):
            case_id = d["processingCaseId"]
if case_id:
    s, b = call(f"/api/admin/processing/cases/{case_id}/form-draft", "ocr", "POST", b"{}", "application/json")
    prev = (((b or {}).get("data") or {}).get("form_draft_preview") or {}).get("diagnostics", {}).get("extracted_text_preview") if isinstance(b, dict) else None
    check("form-draft as ocr returns the OCR preview", "ocr", s == 200 and bool(prev), s, code_of(b), preview_present=bool(prev))
    s, b = call(f"/api/admin/processing/cases/{case_id}/form-draft", "processing_only", "POST", b"{}", "application/json")
    prev = (((b or {}).get("data") or {}).get("form_draft_preview") or {}).get("diagnostics", {}).get("extracted_text_preview") if isinstance(b, dict) else None
    check("form-draft as processing_only blanks the OCR preview", "processing_only", s == 200 and prev == "", s, code_of(b), preview_present=bool(prev))
    for p, present in {"ocr": True, "no_docs": False, "doc_reader": False, "processing_only": False}.items():
        s, b = call(f"/api/admin/processing/cases/{case_id}", p)
        detail = ((b or {}).get("data") or {}).get("detail") or {} if isinstance(b, dict) else {}
        prev = ((detail.get("formDraftPreview") or {}).get("diagnostics") or {}).get("extracted_text_preview")
        ok = (s == 200 and bool(prev) == present) or (not present and s in (403, 404))
        check(f"case detail OCR preview present = {present}", p, ok, s, code_of(b), preview_present=bool(prev))
else:
    check("processing case for the intake document", None, False, None, reason="no case id")

# 5. Public ingestion. No valid token and no valid file are sent, so nothing can be written.
# A REAL oversize body (6 MiB of zero bytes, not a valid file). The platform edge or the route must refuse it,
# and either refusal persists nothing. Which layer answered is recorded.
big_body, big_ct = multipart({"first_name": "QA"}, "oversize.pdf", b"\x00" * (6 * 1024 * 1024), "application/pdf")
try:
    s, b = call("/api/vendor-application", None, "POST", big_body, big_ct)
except Exception as e:  # a connection closed by the edge is also a refusal; record it as such
    s, b = None, {"error": type(e).__name__}
layer = "route" if code_of(b) == "TOO_LARGE" else ("platform_edge" if s == 413 else ("connection_closed" if s is None else "other"))
check("vendor application: oversize body refused", None, s in (413, None), s, code_of(b), layer=layer)


def rate_probe(name, path, body, ctype, limit):
    statuses = []
    for _ in range(limit + 2):
        try:
            s, b = call(path, None, "POST", body, ctype)
        except Exception:
            s, b = None, None
        statuses.append(s)
        if s == 429:
            break
    limited = 429 in statuses
    first429 = statuses.index(429) + 1 if limited else None
    pre = set(statuses[:-1]) if limited else set(statuses)
    check(f"{name}: rate-limited per caller", None, limited and 200 not in pre and first429 is not None and first429 <= limit + 1, statuses[-1], None,
          attempts=len(statuses), first_429_at=first429, other_statuses=sorted(pre))


bogus = f"qa-d1b-invalid-{uuid.uuid4().hex}"
rate_probe("enrollment upload", f"/api/public/forms/{bogus}/enrollment-upload", json.dumps({"field_id": "x"}).encode(), "application/json", 30)
rate_probe("enrollment signature", f"/api/public/forms/{bogus}/enrollment-signature-asset", json.dumps({"png_base64": ""}).encode(), "application/json", 20)
empty_body, empty_ct = multipart({}, None, b"", "")
rate_probe("vendor application", "/api/vendor-application", empty_body, empty_ct, 5)

summary = {"passed": sum(r["pass"] for r in results), "total": len(results), "qa_run_id": RUN, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
print("\nSUMMARY", json.dumps(summary))
json.dump({"summary": summary, "results": results}, open(os.path.join(HERE, f"d1b_hosted_security_cert_results.{RUN}.json"), "w"), indent=2)
