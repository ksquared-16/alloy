"""Documents V1 / D5 — hosted Processing document filing certification (authz_q1 personas).

Usage: d5_hosted_filing_cert.py <qa_run_id> ensure|certify|reset

A run-scoped HOUSEHOLD FIXTURE (one adult, two children, one case) built and removed only through the deployed
product's own audited routes, as the run's fixture_admin session, plus received documents uploaded into Processing
(open_processing_case, intent store_document) — exactly what an operator's "Store on a record" upload does:

  ensure   create_lead → POST /api/admin/customer-members ×2 → Processing uploads: an enrollment form, two immunization
           records, a driver's license, a custody order, an unlabelled scan, a duplicate-submission scan, a text file,
           a form template (intent generate_form) and a scripted PDF that screening quarantines.
  certify  the D5 gates through real HTTP from every persona: the Documents queue, the workspace, proposals, filing by
           approval (refusal and retry, idempotency, duplicate submission, review, new version vs new document, format,
           subject type, sensitivity, quarantine), the D4 library and history after filing, and the upload policy.
  reset    the audited POS deletes for documents whose cases are still open (and the quarantined upload) →
           POST /api/admin/opportunities/[id]/delete: the lead-deletion graph disposes of every filed document, its own
           completed filing case and any received document superseded into it (D5 disposal) → verifies every id is gone.

Synthetic names/emails only (qa-d5-<run>-*@example.com), titles and file names carry qa-authz-<run>. Never prints a
cookie, signed URL, storage path or content.
"""
import json, os, sys, threading, urllib.request, urllib.error, uuid

BASE = "https://staging.workwithalloy.com"
AUTH = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.path.dirname(os.path.abspath(__file__))
RUN = sys.argv[1]
PHASE = sys.argv[2]
TAG = f"qa-authz-{RUN}"
SUFFIX = RUN.split("_", 1)[1]
STATE_FILE = os.path.join(HERE, f"d5_hosted_fixture_ids.{RUN}.json")
RESULTS_FILE = os.path.join(HERE, f"d5_hosted_filing_cert_results.{RUN}.json")
RESET_FILE = os.path.join(HERE, f"d5_hosted_reset_results.{RUN}.json")
JS_PDF = (b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\n"
          b"trailer\n<< /Root 1 0 R >>\n%%EOF\n")
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
        with urllib.request.urlopen(req, timeout=120) as r:
            raw, status = r.read(), r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read(), e.code
    try:
        b = json.loads(raw or b"null")
    except Exception:
        b = {"_non_json_bytes": len(raw)}
    return status, b


def j(path, persona, body, method="POST"):
    return call(path, persona, method, json.dumps(body).encode(), "application/json")


def code_of(b):
    return b.get("code") if isinstance(b, dict) else None


def tiny_pdf(label):
    text = f"QA authz D5 fixture {label}"
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


def multipart(fields, filename, content, mime):
    b = "----qaauthz" + uuid.uuid4().hex
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()]
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + content + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={b}"


def upload(persona, fields, filename, content, mime="application/pdf"):
    body, ct = multipart(fields, filename, content, mime)
    return call("/api/admin/documents/upload", persona, "POST", body, ct)


def library(persona, subject_type, subject_id, focus=None):
    q = f"/api/admin/documents/library?subject_type={subject_type}&subject_id={subject_id}"
    if focus:
        q += f"&focus_type={focus[0]}&focus_id={focus[1]}"
    return call(q, persona)


def load():
    return json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {}


def save(ids):
    json.dump(ids, open(STATE_FILE, "w"), indent=2)


def email(k):
    return f"qa-d5-{SUFFIX}-{k}@example.com"


# Received documents. key → (file-name stem, intent, content, mime). The file name is what the deterministic classifier
# reads, so it proposes immunization_record / enrollment_document where the name says so.
INTAKE = [
    ("enr", "enrollment-form", "store_document", None, "application/pdf"),
    ("imm1", "immunization-record", "store_document", None, "application/pdf"),
    ("imm2", "immunization-record-update", "store_document", None, "application/pdf"),
    ("dl", "drivers-license-copy", "store_document", None, "application/pdf"),
    ("cust", "court-order-scan", "store_document", None, "application/pdf"),
    ("amb", "unlabelled-scan", "store_document", None, "application/pdf"),
    ("dup", "enrollment-form-resubmitted", "store_document", None, "application/pdf"),
    ("txt", "notes", "store_document", b"QA authz D5 plain text note\n", "text/plain"),
    ("tpl", "blank-template", "generate_form", None, "application/pdf"),
    ("held", "scripted", "store_document", JS_PDF, "application/pdf"),
]

# ---------------------------------------------------------------------------------------------------------------- ensure
if PHASE == "ensure":
    ids = load()
    A = "fixture_admin"
    if "opportunity" not in ids:
        s, b = j("/api/admin/actions/execute", A, {
            "action_key": "create_lead", "entity_type": "opportunity", "mode": "execute",
            "payload": {"first_name": "QA D5 Adult", "last_name": f"One {SUFFIX}", "email": email("a1")},
            "context": {"surface": "work_unit"},
        })
        data = (b or {}).get("data") or {} if isinstance(b, dict) else {}
        er = data.get("execution_result") or {}
        detail = er.get("detail") or {} if isinstance(er, dict) else {}
        opp = data.get("affected_id") or detail.get("opportunity_id") or (er.get("affectedId") if isinstance(er, dict) else None)
        print(f"create_lead: status={s} code={code_of(b)} mode={detail.get('mode')} has_opp={bool(opp)}")
        if not opp or detail.get("mode") == "processing_review":
            sys.exit(1)
        ids["opportunity"] = opp
        save(ids)
    opp = ids["opportunity"]
    s, b = library(A, "opportunity", opp)
    lib = (b or {}).get("library") or {}
    hh = (lib.get("household") or {}).get("id")
    adults = [x["subject_id"] for x in lib.get("subjects", []) if x.get("role") == "adult"]
    print(f"library(case): status={s} household={bool(hh)} adults={len(adults)}")
    if not hh or not adults:
        sys.exit(1)
    ids["household"] = hh
    ids.setdefault("adult1", adults[0])
    save(ids)
    for k, first in (("child1", "Kid One"), ("child2", "Kid Two")):
        if k in ids:
            continue
        s, b = j("/api/admin/customer-members", A, {
            "customer_id": hh, "display_name": f"QA D5 {first} {SUFFIX}", "relationship": "child",
            "first_name": f"QA D5 {first}", "last_name": SUFFIX,
        })
        row = ((b or {}).get("member") or (b or {}).get("row") or (b or {}).get("data") or b) if isinstance(b, dict) else {}
        if isinstance(row, dict) and isinstance(row.get("member"), dict):
            row = row["member"]
        mid = row.get("id") if isinstance(row, dict) else None
        print(f"customer-member {k}: status={s} code={code_of(b)} has_id={bool(mid)}")
        if not mid:
            sys.exit(1)
        ids[k] = mid
        save(ids)

    docs = ids.setdefault("docs", {})
    cases = ids.setdefault("cases", {})
    for key, stem, intent, content, mime in INTAKE:
        if key in docs:
            continue
        ext = "txt" if mime == "text/plain" else "pdf"
        s, b = upload(A, {"open_processing_case": "true", "processing_intent": intent, "title": f"{TAG} {stem}"}, f"{TAG}-{stem}.{ext}", content or tiny_pdf(stem), mime)
        d = (b or {}).get("document") if isinstance(b, dict) else None
        did = d.get("id") if isinstance(d, dict) else None
        cid = (b or {}).get("processing_case_id") if isinstance(b, dict) else None
        scr = ((b or {}).get("screening") or {}).get("verdict") if isinstance(b, dict) else None
        print(f"upload {key}: status={s} code={code_of(b)} has_doc={bool(did)} has_case={bool(cid)} screening={scr}")
        if not did:
            sys.exit(1)
        docs[key] = did
        if cid:
            cases[key] = cid
        save(ids)
    print("ENSURE", json.dumps({k: (bool(v) if not isinstance(v, dict) else sorted(v)) for k, v in ids.items()}))
    sys.exit(0)

# --------------------------------------------------------------------------------------------------------------- certify
results = []


def check(case, persona, ok, status, code=None, **extra):
    results.append({"case": case, "persona": persona, "pass": bool(ok), "status": status, "code": code, **extra})
    print(("PASS " if ok else "FAIL ") + f"[{persona}] {case} :: status={status} code={code}" + (f" {json.dumps(extra)}" if extra else ""))


if PHASE == "certify":
    ids = load()
    D, C = ids["docs"], ids["cases"]
    opp, hh, a1, c1, c2 = ids["opportunity"], ids["household"], ids["adult1"], ids["child1"], ids["child2"]
    A = "fixture_admin"
    SECRETS = [TAG, SUFFIX, "QA D5"]

    def queue(p):
        return call("/api/admin/processing/documents/queue", p)

    def ws(p, key, household=None):
        return call(f"/api/admin/processing/cases/{C[key]}/document-filing" + (f"?household_id={household}" if household else ""), p)

    def propose(p, key, proposal):
        return j(f"/api/admin/processing/cases/{C[key]}/document-filing", p, {"proposal": proposal}, "PUT")

    def approve(p, key):
        return call(f"/api/admin/processing/cases/{C[key]}/approve", p, "POST", b"{}", "application/json")

    def case_status(key):
        s, b = call(f"/api/admin/processing/cases/{C[key]}", A)
        detail = (((b or {}).get("data") or {}).get("detail") or {}) if isinstance(b, dict) else {}
        return detail.get("status") if s == 200 else None

    def leaks(b):
        raw = json.dumps(b)
        return [x for x in SECRETS if x in raw]

    def rows(b):
        return {r["case_id"]: r for r in ((b or {}).get("rows") or [])} if isinstance(b, dict) else {}

    def listed(b):
        return {d["id"]: d for d in (((b or {}).get("library") or {}).get("documents") or [])}

    def child(i):
        return {"subject_type": "child", "subject_id": i}

    def data_of(b):
        return (b or {}).get("data") or {} if isinstance(b, dict) else {}

    # 1. Unauthorized Processing actors and the Processing operator without destination authority.
    for p, want in (("doc_reader", 403), ("no_docs", 403), ("processing_only", 403)):
        s, b = queue(p)
        check("queue refused without processing.operate + documents.read", p, s == want and not leaks(b), s, code_of(b))
    for p in ("doc_reader", "no_docs"):
        s, b = approve(p, "enr")
        check("filing refused without processing.operate", p, s == 403 and not leaks(b), s, code_of(b))
    for p in ("processing_only", "ocr"):
        s, b = approve(p, "enr")
        check("a Processing operator without documents.write cannot file", p, s in (403, 404) and code_of(b) in ("DOCUMENTS_WRITE_REQUIRED", None, "NOT_FOUND") and not leaks(b), s, code_of(b))
    s, b = propose("ocr", "enr", {"doc_type": "enrollment_document", "household_id": hh, "primary": child(c1)})
    check("a proposal needs documents.write", "ocr", s == 403 and not leaks(b), s, code_of(b))
    check("refused attempts left the case open", A, case_status("enr") == "received", 200, None, status_now=case_status("enr"))

    # 2. The queue, from the case spine.
    s, b = queue(A)
    q = rows(b)
    open_keys = ("enr", "imm1", "imm2", "dl", "cust", "amb", "dup", "txt")
    check("queue lists every received customer document of the run", A, s == 200 and all(C[k] in q for k in open_keys), s, code_of(b),
          missing=[k for k in open_keys if C[k] not in q])
    check("a form-template upload is not a customer document", A, C["tpl"] not in q, s)
    check("a quarantined upload opened no case and is not queued", A, "held" not in C and all(r["document_id"] != D["held"] for r in q.values()), s)
    r = q.get(C["imm1"]) or {}
    check("unclassified row: suggestion shown as a proposal, no record chosen", A,
          r.get("lane") == "unclassified" and (r.get("suggested_type") or {}).get("key") == "immunization_record" and r.get("proposed_subject") is None
          and r.get("uncertainty", {}).get("subject") == "unresolved" and r.get("required_action") == "Choose the document type", s, None,
          lane=r.get("lane"), suggested=(r.get("suggested_type") or {}).get("key"))
    for p in ("ocr",):
        s2, b2 = queue(p)
        check("an operator with processing.operate + documents.read sees the queue", p, s2 == 200 and C["enr"] in rows(b2), s2)
    s2, b2 = queue("scoped_ops")
    check("department-restricted operator: unattached intake is out of scope, not listed", "scoped_ops", s2 == 200 and C["enr"] not in rows(b2), s2)
    s2, b2 = queue("cross_org_admin")
    check("another organization's queue does not contain the run's cases", "cross_org_admin", s2 == 200 and not any(c in rows(b2) for c in C.values()), s2)

    # 3. The workspace: catalog, suggestion, no automatic match.
    s, b = ws(A, "imm1")
    w = (b or {}).get("workspace") or {}
    keys = {t["key"] for t in w.get("catalog") or []}
    imm = next((t for t in w.get("catalog") or [] if t["key"] == "immunization_record"), {})
    check("workspace offers the published Studio catalog with its policy", A,
          s == 200 and {"immunization_record", "enrollment_document", "custody_order", "drivers_license"} <= keys
          and imm.get("review_required") is True and imm.get("default_sensitivity") == "medical" and "child" in imm.get("subject_types", []), s, code_of(b))
    check("classifier suggestion is a proposal; nothing chosen; no household matched", A,
          (w.get("suggested_type") or {}).get("key") == "immunization_record" and (w.get("proposal") or {}).get("doc_type") is None and w.get("household") is None, s)
    for p in ("scoped_ops", "cross_org_admin"):
        s2, b2 = ws(p, "enr")
        check("workspace of a case out of reach is not found (no leak)", p, s2 == 404 and not leaks(b2), s2, code_of(b2))
    s2, b2 = approve("cross_org_admin", "enr")
    check("cross-organization filing refused as not found", "cross_org_admin", s2 == 404 and not leaks(b2), s2, code_of(b2))
    s2, b2 = propose("cross_org_admin", "enr", {"doc_type": "enrollment_document", "household_id": hh, "primary": child(c1)})
    check("cross-organization proposal refused", "cross_org_admin", s2 in (403, 404) and not leaks(b2), s2, code_of(b2))
    s, b = ws(A, "enr", hh)
    members = {(m["subject_type"], m["subject_id"]) for m in (((b or {}).get("workspace") or {}).get("household") or {}).get("members", [])}
    check("the household graph is offered for record selection", A, s == 200 and {("household", hh), ("person", a1), ("child", c1), ("child", c2), ("opportunity", opp)} <= members, s)

    # 4. Ambiguous identity: no record chosen → filing refused, case open.
    s, b = approve(A, "amb")
    check("no type / no record: filing refused, nothing filed", A, s in (400, 409, 422) and code_of(b) in ("TYPE_REQUIRED", "SUBJECT_REQUIRED"), s, code_of(b))
    check("refused filing leaves the case open", A, case_status("amb") == "received", 200, None, status_now=case_status("amb"))

    # 5. Classification correction: a wrong type for the record is refused, the corrected type files.
    s, b = propose(A, "amb", {"doc_type": "immunization_record", "doc_type_source": "operator", "household_id": hh, "primary": {"subject_type": "household", "subject_id": hh}, "review_accepted": True})
    s, b = approve(A, "amb")
    check("subject-type policy: a child-only type is refused for a household", A, s == 422 and code_of(b) == "TYPE_SUBJECT_NOT_APPLICABLE", s, code_of(b))
    s, b = queue(A)
    check("the refusal is a Filing error in the queue, never done", A, (rows(b).get(C["amb"]) or {}).get("lane") == "filing_error", s, None, lane=(rows(b).get(C["amb"]) or {}).get("lane"))
    s, b = propose(A, "amb", {"doc_type": "enrollment_document", "doc_type_source": "operator", "household_id": hh, "primary": {"subject_type": "household", "subject_id": hh}})
    s, b = approve(A, "amb")
    check("corrected classification files", A, s == 200 and data_of(b).get("status") == "completed", s, code_of(b))

    # 6. Upload → classify → resolve → approve → file, with related records.
    s, b = propose(A, "enr", {"doc_type": "enrollment_document", "doc_type_source": "suggested", "household_id": hh, "primary": child(c1),
                              "contexts": [{"subject_type": "household", "subject_id": hh}, {"subject_type": "opportunity", "subject_id": opp}]})
    check("proposal saved (labels from the server)", A, s == 200 and ((b or {}).get("proposal") or {}).get("primary", {}).get("label", "").startswith("QA D5 Kid One"), s, code_of(b))
    s, b = ws(A, "enr")
    pv = ((b or {}).get("workspace") or {}).get("preview") or {}
    check("preview: ready, nothing to resolve", A, s == 200 and pv.get("can_file") is True and not pv.get("problems"), s, None, problems=[p["code"] for p in pv.get("problems") or []])
    s, b = approve(A, "enr")
    res = data_of(b).get("operationalResult") or {}
    check("filing commits and completes the case", A, s == 200 and data_of(b).get("status") == "completed" and res.get("kind") == "document_filed"
          and res.get("filed_document_id") == D["enr"] and (res.get("primary") or {}).get("subject_id") == c1, s, code_of(b))
    check("case completed only after filing", A, case_status("enr") == "completed", 200, None, status_now=case_status("enr"))
    s, b = approve(A, "enr")
    check("re-approval is idempotent", A, s == 200 and data_of(b).get("alreadyDone") is True, s, code_of(b))
    s, b = call(f"/api/admin/documents/{D['enr']}/versions", A)
    check("no duplicate version", A, s == 200 and len((b or {}).get("versions") or []) == 1, s, None, versions=len((b or {}).get("versions") or []))

    # 7. Duplicate submission: two concurrent approvals file once.
    propose(A, "dup", {"doc_type": "enrollment_document", "household_id": hh, "primary": child(c2)})
    outcomes = []

    def go():
        outcomes.append(approve(A, "dup"))

    t1, t2 = threading.Thread(target=go), threading.Thread(target=go)
    t1.start(); t2.start(); t1.join(); t2.join()
    st = sorted(o[0] for o in outcomes)
    s, b = library(A, "child", c2)
    dup_entries = [d for d in listed(b).values() if d["id"] == D["dup"]]
    s3, b3 = call(f"/api/admin/documents/{D['dup']}/subjects", A)
    subj = [x for x in (b3 or {}).get("subjects") or [] if x.get("derived_from") == "document_subjects"]
    check("duplicate submission files exactly once", A, all(x in (200, 409) for x in st) and 200 in st and len(dup_entries) == 1 and len(subj) == 1, st[0], None,
          statuses=st, associations=len(subj))
    s, b = call(f"/api/admin/documents/{D['dup']}/history", A)
    filed = [e for e in (b or {}).get("entries") or [] if e.get("action") == "Filed from Processing"]
    check("history records one committed filing", A, s == 200 and len(filed) == 1 and filed[0].get("kind") == "committed", s, None, filed=len(filed))

    # 8. Review required, refusal and retry; sensitivity raised by type.
    propose(A, "imm1", {"doc_type": "immunization_record", "doc_type_source": "suggested", "household_id": hh, "primary": child(c2)})
    s, b = approve(A, "imm1")
    check("review-required type refused without a review", A, s == 409 and code_of(b) == "REVIEW_REQUIRED", s, code_of(b))
    check("case stays open after the refusal", A, case_status("imm1") == "received", 200)
    propose(A, "imm1", {"doc_type": "immunization_record", "doc_type_source": "suggested", "household_id": hh, "primary": child(c2), "review_accepted": True})
    s, b = approve(A, "imm1")
    check("retry after review files", A, s == 200 and data_of(b).get("status") == "completed", s, code_of(b))
    s, b = library(A, "household", hh)
    m = listed(b).get(D["imm1"]) or {}
    check("medical type raised the class; review recorded on the version", A, m.get("sensitivity") == "medical" and (m.get("current_version") or {}).get("review_status") == "accepted", s, None,
          sensitivity=m.get("sensitivity"), review=(m.get("current_version") or {}).get("review_status"))

    # 9. New version versus new logical document.
    propose(A, "imm2", {"doc_type": "immunization_record", "household_id": hh, "primary": child(c2), "review_accepted": True})
    s, b = approve(A, "imm2")
    check("a second document of a new_version type is not a new document", A, s == 409 and code_of(b) == "NEW_VERSION_REQUIRED", s, code_of(b))
    s, b = ws(A, "imm2")
    ex = [d["id"] for d in ((((b or {}).get("workspace") or {}).get("preview") or {}).get("existing_of_type") or [])]
    check("preview names the existing document to version", A, D["imm1"] in ex, s)
    propose(A, "imm2", {"doc_type": "immunization_record", "household_id": hh, "primary": child(c2), "review_accepted": True, "mode": "new_version", "target_document_id": D["imm1"]})
    s, b = approve(A, "imm2")
    res = data_of(b).get("operationalResult") or {}
    check("filed as version 2 of the existing document", A, s == 200 and res.get("mode") == "new_version" and res.get("filed_document_id") == D["imm1"] and res.get("version_number") == 2, s, code_of(b))
    s, b = call(f"/api/admin/documents/{D['imm1']}/versions", A)
    check("one logical document, two versions", A, s == 200 and len((b or {}).get("versions") or []) == 2, s, None, versions=len((b or {}).get("versions") or []))
    s, b = library(A, "child", c2)
    lc2 = listed(b)
    check("library: the version is not a second document; the received document is not listed", A,
          D["imm1"] in lc2 and D["imm2"] not in lc2 and (lc2[D["imm1"]].get("version_count") == 2), s)
    s, b = call(f"/api/admin/documents/{D['imm2']}/signed-url", A)
    check("the superseded received document is unavailable", A, s in (403, 404), s, code_of(b))
    s, b = call(f"/api/admin/documents/{D['imm1']}/history", A)
    acts = [e.get("action") for e in (b or {}).get("entries") or []]
    check("history: filed from Processing as version 2", A, s == 200 and "Filed from Processing as version 2" in acts, s)

    # 10. Identity-sensitive and safeguarding documents.
    propose(A, "dl", {"doc_type": "drivers_license", "household_id": hh, "primary": {"subject_type": "person", "subject_id": a1}, "review_accepted": True, "sensitivity": "personal_identity"})
    s, b = approve(A, "dl")
    check("identity document filed with a raised class", A, s == 200, s, code_of(b))
    propose(A, "cust", {"doc_type": "custody_order", "household_id": hh, "primary": child(c1), "review_accepted": True})
    s, b = approve(A, "cust")
    check("custody order filed (safeguarding class)", A, s == 200, s, code_of(b))
    s, b = library(A, "household", hh)
    la = listed(b)
    check("cleared admin sees identity and safeguarding documents with their classes", A,
          (la.get(D["dl"]) or {}).get("sensitivity") == "personal_identity" and (la.get(D["cust"]) or {}).get("sensitivity") == "custody_safeguarding", s)
    s, b = library("doc_reader", "household", hh)
    lr = listed(b)
    check("reader without clearance: medical, identity and safeguarding documents withheld", "doc_reader",
          s == 200 and D["enr"] in lr and not ({D["imm1"], D["dl"], D["cust"]} & set(lr)), s, None, listed=len(lr))

    # 11. File type and policy at filing; and the same policy on upload.
    propose(A, "txt", {"doc_type": "enrollment_document", "household_id": hh, "primary": child(c1)})
    s, b = approve(A, "txt")
    check("format policy refuses a text file for a PDF/image type", A, s == 422 and code_of(b) == "TYPE_FORMAT_NOT_ALLOWED", s, code_of(b))
    body, ct = multipart({"entity_type": "person", "entity_id": a1, "doc_type": "immunization_record", "title": f"{TAG} upload-policy"}, f"{TAG}-upload-policy.pdf", tiny_pdf("up"), "application/pdf")
    s, b = call("/api/admin/documents/upload", A, "POST", body, ct)
    check("upload: a child-only type refused for an adult, nothing stored", A, s == 422 and code_of(b) == "TYPE_SUBJECT_NOT_APPLICABLE", s, code_of(b))
    body, ct = multipart({"entity_type": "customer_member", "entity_id": c1, "doc_type": "custody_order", "title": f"{TAG} upload-format"}, f"{TAG}-upload-format.txt", b"QA authz D5 text\n", "text/plain")
    s, b = call("/api/admin/documents/upload", A, "POST", body, ct)
    check("upload: a format the type does not allow refused, nothing stored", A, s == 422 and code_of(b) == "TYPE_FORMAT_NOT_ALLOWED", s, code_of(b))

    # 12. Library integration: household, parent, child; one identity across associations.
    s, b = library(A, "household", hh)
    lh = listed(b)
    e = lh.get(D["enr"]) or {}
    assoc = sorted((x["subject_type"], x["association"]) for x in e.get("associations") or [])
    check("filed documents listed once each in the household library", A,
          s == 200 and all(D[k] in lh for k in ("enr", "amb", "dup", "imm1", "dl", "cust")) and sum(1 for k in lh if k == D["enr"]) == 1, s)
    check("one document, several associations: owner child, related household and case", A,
          ("child", "owner") in assoc and ("household", "context") in assoc and ("opportunity", "context") in assoc and e.get("version_count") == 1, s, None, associations=assoc)
    s, b = library(A, "opportunity", opp, ("child", c1))
    check("child-narrowed library holds the child's filed documents", A, s == 200 and {D["enr"], D["cust"]} <= set(listed(b)), s)
    s, b = library(A, "opportunity", opp, ("person", a1))
    check("parent-narrowed library holds the parent's filed document", A, s == 200 and D["dl"] in listed(b), s)
    s, b = queue(A)
    lanes = {k: (rows(b).get(C[k]) or {}).get("lane") for k in ("enr", "amb", "dup", "imm1", "imm2", "dl", "cust", "txt")}
    check("queue lanes after filing: filed, and the refused text file in filing errors", A,
          all(lanes[k] == "filed" for k in ("enr", "amb", "dup", "imm1", "imm2", "dl", "cust")) and lanes["txt"] == "filing_error", s, None, lanes=lanes)

    summary = {"passed": sum(1 for r in results if r["pass"]), "total": len(results)}
    json.dump({"run": RUN, "summary": summary, "results": results}, open(RESULTS_FILE, "w"), indent=2)
    print("SUMMARY", json.dumps(summary))
    sys.exit(0 if summary["passed"] == summary["total"] else 1)

# ----------------------------------------------------------------------------------------------------------------- reset
if PHASE == "reset":
    ids = load()
    A = "fixture_admin"
    out = {}
    D, C = ids.get("docs") or {}, ids.get("cases") or {}
    # Documents whose cases are still open (and the quarantined upload, which opened none): the audited POS delete.
    for key in ("txt", "tpl", "held"):
        if key in D:
            s, b = call(f"/api/admin/pos/documents/{D[key]}", A, "DELETE")
            out[f"pos_delete_{key}"] = s
            print(f"pos delete {key}: status={s} code={code_of(b)}")
    # Anything else still open (a failed certify run) is a throwaway upload too.
    for key, cid in C.items():
        if key in ("txt", "tpl"):
            continue
        s, b = call(f"/api/admin/processing/cases/{cid}", A)
        st = ((((b or {}).get("data") or {}).get("detail") or {}).get("status")) if isinstance(b, dict) else None
        if s == 200 and st not in ("completed", "archived"):
            s2, b2 = call(f"/api/admin/pos/documents/{D[key]}", A, "DELETE")
            out[f"pos_delete_open_{key}"] = s2
            print(f"pos delete (open case) {key}: status={s2} code={code_of(b2)}")
    if ids.get("opportunity"):
        s, b = call(f"/api/admin/opportunities/{ids['opportunity']}/delete-preview", A)
        pv = (b or {}).get("preview") or {} if isinstance(b, dict) else {}
        print(f"delete-preview: status={s} blocked={pv.get('blocked')} counts={json.dumps(pv.get('counts'))}")
        s, b = call(f"/api/admin/opportunities/{ids['opportunity']}/delete", A, "POST", b"{}", "application/json")
        out["lead_delete"] = s
        print(f"lead delete: status={s} code={code_of(b)} ok={(b or {}).get('ok') if isinstance(b, dict) else None}")
    gone = {}
    for key, did in D.items():
        s, _ = call(f"/api/admin/documents/{did}/signed-url", A)
        gone[f"doc_{key}"] = s
    for key, cid in C.items():
        s, _ = call(f"/api/admin/processing/cases/{cid}", A)
        gone[f"case_{key}"] = s
    if ids.get("household"):
        s, _ = library(A, "household", ids["household"])
        gone["household_library"] = s
    out["after"] = gone
    out["all_gone"] = all(v == 404 for v in gone.values())
    print("RESET", json.dumps(out))
    json.dump(out, open(RESET_FILE, "w"), indent=2)
    sys.exit(0 if out["all_gone"] else 1)
