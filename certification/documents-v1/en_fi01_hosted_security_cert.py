"""Documents V1 / EN-FI-01 — hosted medical-document authorization certification (authz_q1 personas).

Usage: en_fi01_hosted_security_cert.py <qa_run_id> setup|baseline|certify|teardown

  setup     as fixture_admin, through the deployed product's own audited routes:
              * a run-scoped household (create_lead in QA D1) with one child, and an immunization_record (MEDICAL type)
                uploaded to the child;
              * a Processing intake (open_processing_case) whose DECLARED class is raised to medical — a Processing case
                whose source document is medical;
              * an ordinary document on OPP2 (QA D2: outside scoped_ops' department).
  baseline  the SAME probes, recording what the CURRENT deployment does (before the security release). A probe "passes"
            here when it observes the exposure the census predicted — evidence that the exposure is real, not a guess.
  certify   the same probes, asserting the REPAIRED behaviour (after the security release is deployed).
  teardown  POS delete of the intake (fixture_admin), document delete of the OPP2 document, audited lead deletion of the
            household; verifies every id is gone.

Personas (registered authz_q1): fixture_admin (organization administrator: Documents + Medical), doc_reader (documents.read
only), ocr (documents.read + processing.operate), processing_only (processing.operate, no documents.read), no_docs,
scoped_ops (documents.read, department QA D1 only), cross_org_admin (QA Secondary), anonymous. The plan has no
"health.view without Documents" persona and no Documents/Processing WRITER without health.view; those cells are proven
locally (web/tests/documents/documentsEnFi01MedicalMetadata.test.ts) and named in the record.

Never prints a cookie, signed URL, storage path, title or file name: only status codes, booleans and counts.
"""
import json, os, sys, urllib.request, urllib.error, uuid

BASE = "https://staging.workwithalloy.com"
AUTH = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.path.dirname(os.path.abspath(__file__))
RUN = sys.argv[1]
PHASE = sys.argv[2]
TAG = f"qa-authz-{RUN}"
SUFFIX = RUN.split("_", 1)[1]
STATE_FILE = os.path.join(HERE, f"en_fi01_hosted_fixture_ids.{RUN}.json")
RESULTS_FILE = os.path.join(HERE, f"en_fi01_hosted_results.{PHASE}.{RUN}.json")
OPP2 = "aa000000-0000-4000-8000-000000000112"
WU1_UNIT = "aa000000-0000-4000-8000-000000000101"
RESTRICTED = "Document (restricted)"
PERSONAS = ["fixture_admin", "doc_reader", "ocr", "processing_only", "no_docs", "scoped_ops", "cross_org_admin", None]
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


def j(path, persona, payload, method="POST"):
    return call(path, persona, method, json.dumps(payload).encode(), "application/json")


def code_of(b):
    return b.get("code") if isinstance(b, dict) else None


def tiny_pdf(label):
    text = f"QA authz EN-FI-01 fixture {label}"
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


def upload(persona, key, fields, content, name, mime):
    b = "----qaenfi01" + uuid.uuid4().hex
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in {**fields, "title": f"{TAG} {key}"}.items()]
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + content + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return call("/api/admin/documents/upload", persona, "POST", b"".join(parts), f"multipart/form-data; boundary={b}")


results = []


def check(case, persona, ok, status, code=None, **extra):
    results.append({"case": case, "persona": persona or "anonymous", "pass": bool(ok), "status": status, "code": code, **extra})
    print(("PASS " if ok else "FAIL ") + f"[{persona or 'anonymous'}] {case} :: status={status} code={code}" + (f" {json.dumps(extra)}" if extra else ""))


def save(ids):
    json.dump(ids, open(STATE_FILE, "w"), indent=2)


# ── setup ─────────────────────────────────────────────────────────────────────────────────────────────────────────
if PHASE == "setup":
    ids = json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {}
    if "opportunity" not in ids:
        s, b = j("/api/admin/actions/execute", "fixture_admin", {
            "action_key": "create_lead", "entity_type": "opportunity", "mode": "execute",
            "payload": {"first_name": "QA ENFI01 Adult", "last_name": SUFFIX, "email": f"qa-enfi01-{SUFFIX}-a1@example.com"},
            "context": {"work_unit_id": WU1_UNIT, "surface": "work_unit"},
        })
        data = (b or {}).get("data") or {} if isinstance(b, dict) else {}
        er = data.get("execution_result") or {}
        detail = er.get("detail") or {} if isinstance(er, dict) else {}
        opp = data.get("affected_id") or detail.get("opportunity_id") or (er.get("affectedId") if isinstance(er, dict) else None)
        print(f"create_lead: status={s} has_opp={bool(opp)}")
        if not opp:
            sys.exit(1)
        ids["opportunity"] = opp
        save(ids)
    if "child" not in ids:
        s, b = call(f"/api/admin/documents/library?subject_type=opportunity&subject_id={ids['opportunity']}", "fixture_admin")
        household = (((b or {}).get("library") or {}).get("household") or {}).get("id") if isinstance(b, dict) else None
        if not household:
            print(f"library(case): status={s} household=False")
            sys.exit(1)
        ids["household"] = household
        s, b = j("/api/admin/customer-members", "fixture_admin", {
            "customer_id": household, "display_name": f"QA ENFI01 Kid {SUFFIX}", "relationship": "child",
            "first_name": "QA ENFI01 Kid", "last_name": SUFFIX,
        })
        row = ((b or {}).get("member") or (b or {}).get("row") or (b or {}).get("data") or b) if isinstance(b, dict) else {}
        if isinstance(row, dict) and isinstance(row.get("member"), dict):
            row = row["member"]
        mid = row.get("id") if isinstance(row, dict) else None
        print(f"child: status={s} has_id={bool(mid)}")
        if not mid:
            sys.exit(1)
        ids["child"] = mid
        save(ids)
    if "medical" not in ids:
        s, b = upload("fixture_admin", "medical", {"entity_type": "customer_member", "entity_id": ids["child"], "doc_type": "immunization_record"},
                      tiny_pdf("medical"), f"{TAG}-Immunization_Record.pdf", "application/pdf")
        did = ((b or {}).get("document") or {}).get("id") if isinstance(b, dict) else None
        print(f"upload medical: status={s} has_id={bool(did)}")
        if did:
            ids["medical"] = did
            save(ids)
    if "intake" not in ids:
        s, b = upload("fixture_admin", "intake", {"open_processing_case": "true"},
                      f"QA authz EN-FI-01 intake {SUFFIX}. Synthetic immunization text.\n".encode(), f"{TAG}-Immunization_Intake.txt", "text/plain")
        did = ((b or {}).get("document") or {}).get("id") if isinstance(b, dict) else None
        case = (b or {}).get("processing_case_id") if isinstance(b, dict) else None
        print(f"upload intake: status={s} has_id={bool(did)} processing_case={bool(case)}")
        if did and case:
            ids["intake"], ids["case"] = did, case
            save(ids)
    if "intake" in ids and not ids.get("intake_medical"):
        s, b = j(f"/api/admin/documents/{ids['intake']}/sensitivity", "fixture_admin", {"sensitivity": "medical", "reason": "EN-FI-01 hosted certification: a medical Processing source"})
        ids["intake_medical"] = s == 200 and isinstance(b, dict) and b.get("sensitivity") == "medical"
        print(f"raise intake to medical: status={s} raised={ids['intake_medical']}")
        save(ids)
    if "opp2_doc" not in ids:
        s, b = upload("fixture_admin", "opp2", {"entity_type": "opportunity", "entity_id": OPP2, "doc_type": "other"}, tiny_pdf("opp2"), f"{TAG}-opp2.pdf", "application/pdf")
        did = ((b or {}).get("document") or {}).get("id") if isinstance(b, dict) else None
        print(f"upload opp2: status={s} has_id={bool(did)}")
        if did:
            ids["opp2_doc"] = did
            save(ids)
    ok = all(k in ids for k in ("child", "medical", "intake", "case", "opp2_doc")) and ids.get("intake_medical")
    print("SETUP", "ok" if ok else "INCOMPLETE")
    sys.exit(0 if ok else 1)

# ── probes (baseline / certify) ───────────────────────────────────────────────────────────────────────────────────
if PHASE in ("baseline", "certify"):
    ids = json.load(open(STATE_FILE))
    after = PHASE == "certify"
    MEDICAL_READER = {"fixture_admin"}

    def label_of(row):
        d = (row or {}).get("sourceDisplay") or (row or {}).get("display") or {}
        return d.get("label"), d.get("originalFilename")

    # 1. Processing queue: the medical intake's source label.
    for p in PERSONAS:
        s, b = call("/api/admin/processing/queue?limit=200", p)
        rows = ((b or {}).get("data") or {}).get("rows") or [] if isinstance(b, dict) else []
        row = next((r for r in rows if r.get("id") == ids["case"]), None)
        if p is None:
            check("queue: anonymous refused", p, s in (401, 403), s, code_of(b))
            continue
        if row is None:
            check("queue: case not listed", p, p == "cross_org_admin" or s != 200, s, code_of(b), listed=False)
            continue
        label, fname = label_of(row)
        leaked = bool(fname) or (label not in (None, RESTRICTED) and TAG in str(label))
        if p in MEDICAL_READER:
            check("queue: medical reader sees the real label", p, not after or (label != RESTRICTED and bool(fname)), s, None, restricted=label == RESTRICTED)
        else:
            check(f"queue: medical source label {'hidden' if after else 'EXPOSED (baseline)'}", p, (not leaked) if after else leaked, s, None, leaked=leaked)

    # 2. Processing case detail.
    for p in PERSONAS:
        s, b = call(f"/api/admin/processing/cases/{ids['case']}", p)
        if p is None:
            check("case: anonymous refused", p, s in (401, 403), s, code_of(b))
            continue
        if s != 200:
            check("case: not readable", p, p == "cross_org_admin" or after, s, code_of(b))
            continue
        srcs = (((b or {}).get("data") or b or {}).get("detail") or {}).get("sources") or []
        src = next((x for x in srcs if x.get("id") == ids["intake"] or (x.get("display") or {}).get("id") == ids["intake"]), None)
        label, fname = label_of(src)
        leaked = bool(fname) or (label not in (None, RESTRICTED) and TAG in str(label))
        if p in MEDICAL_READER:
            check("case: medical reader sees the real label", p, not after or not (label == RESTRICTED), s, None)
        else:
            check(f"case: medical source label {'hidden' if after else 'EXPOSED (baseline)'}", p, (not leaked) if after else leaked, s, None, leaked=leaked)

    # 3. p076 diagnostic (live where ALLOY_ROUTE_TIMING=1): counts and filled health-profile keys for a named child.
    for p in PERSONAS:
        s, b = call(f"/api/admin/p076-first-order-prototype?member_id={ids['child']}", p)
        if p is None:
            check("p076: anonymous refused", p, s in (401, 403, 404), s, code_of(b))
        elif p in MEDICAL_READER:
            check("p076: organization administrator may run the diagnostic", p, s in (200, 404), s, code_of(b))
        elif p == "cross_org_admin":
            check("p076: cross-organization reads nothing of this child", p, s in (403, 404) or not any((x.get("rows") or 0) > 0 for x in (b or {}).get("spans", []) if "doc" in str(x.get("name"))), s, code_of(b))
        else:
            exposed = s == 200
            check(f"p076: {'refused' if after else 'EXPOSED (baseline)'}", p, (s in (403, 404)) if after else exposed, s, code_of(b))

    # 4. Related records: a department-restricted reader and another department's document.
    for p in ("scoped_ops", "doc_reader", "fixture_admin"):
        s, b = call(f"/api/admin/related/opportunity/{OPP2}", p)
        listed = ids["opp2_doc"] in [d.get("id") for d in ((b or {}).get("documents") or [])] if isinstance(b, dict) else False
        if p == "scoped_ops":
            check(f"related: out-of-department document {'hidden' if after else 'EXPOSED (baseline)'}", p, (not listed) if after else listed, s, code_of(b), listed=listed)
        else:
            check("related: in-scope reader lists it", p, listed, s, code_of(b))

    # 5. Health card: Medical gate (unchanged) and, after, Documents gates on its list.
    for p in PERSONAS:
        s, b = call(f"/api/admin/health/card?customer_member_id={ids['child']}", p)
        docs = (((b or {}).get("vm") or {}).get("documents") or []) if isinstance(b, dict) else []
        if p in MEDICAL_READER:
            check("health card: Medical + Documents reader lists the child's medical document", p, s == 200 and any(d.get("documentId") == ids["medical"] for d in docs), s, code_of(b))
        else:
            check("health card: refused or empty", p, s in (401, 403, 404) or not any(d.get("documentId") == ids["medical"] for d in docs), s, code_of(b))

    # 6. Library / signed URL (protected before and after): a Documents reader without health.view never gets the medical file.
    for p in PERSONAS:
        s, b = call(f"/api/admin/documents/{ids['medical']}/signed-url", p)
        expect_ok = p in MEDICAL_READER
        check(f"signed-url medical {'allowed' if expect_ok else 'refused'}", p, (s == 200) if expect_ok else (s in (401, 403, 404)), s, code_of(b))

    passed = sum(1 for r in results if r["pass"])
    json.dump({"run": RUN, "phase": PHASE, "summary": {"passed": passed, "total": len(results)}, "results": results}, open(RESULTS_FILE, "w"), indent=2)
    print(f"{PHASE.upper()} {passed}/{len(results)}")
    sys.exit(0 if passed == len(results) else 1)

# ── teardown ──────────────────────────────────────────────────────────────────────────────────────────────────────
if PHASE == "teardown":
    ids = json.load(open(STATE_FILE))
    if ids.get("intake"):
        s, b = call(f"/api/admin/pos/documents/{ids['intake']}", "fixture_admin", "DELETE")
        print(f"pos delete intake: status={s} code={code_of(b)}")
    if ids.get("opp2_doc"):
        s, b = call(f"/api/admin/pos/documents/{ids['opp2_doc']}", "fixture_admin", "DELETE")
        print(f"pos delete opp2 document: status={s} code={code_of(b)}")
    if ids.get("opportunity"):
        # The audited lead deletion (PR #1579): the household, its child and the child's documents with their files.
        s, b = call(f"/api/admin/opportunities/{ids['opportunity']}/delete", "fixture_admin", "POST", b"{}", "application/json")
        print(f"lead deletion: status={s} code={code_of(b)}")
    gone = {}
    for k in ("medical", "intake", "opp2_doc"):
        if ids.get(k):
            s, _ = call(f"/api/admin/documents/{ids[k]}/signed-url", "fixture_admin")
            gone[k] = s == 404
    print("TEARDOWN", json.dumps(gone))
    sys.exit(0 if all(gone.values()) else 1)

print(f"unknown phase {PHASE}")
sys.exit(2)
