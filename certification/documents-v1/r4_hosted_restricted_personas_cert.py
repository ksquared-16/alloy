"""Documents V1 R4 — hosted restricted personas (authz_q1 contract Revision 3: scoped_forms, health_viewer, doc_writer).

Usage: r4_hosted_restricted_personas_cert.py <qa_run_id> ensure|certify|reset

  ensure   as fixture_admin, through the deployed product's own audited routes (helpers reused from the R2/R5, D7 and
           D8/FI-10 drivers): L1 in QA D1 (scoped_forms' department) with child K1; L2 in QA D2 with child KU; one run-scoped
           form with a standard field and a medical (child allergies) field; admin submissions s_opp1 / s_opp2 / s_ku;
           a non-medical document on K1 left PENDING review (doc_writer), a medical immunization record on K1, and a
           reported immunization fact on K1 (health_viewer).
  certify  the Revision 3 matrix rows (authorization-qa-personas.md e6d619f2…):
             scoped_forms  — Forms actions on a D1 subject succeed; the same on a D2 opportunity or an out-of-scope child
                             → 404 (scope, not capability); authoring → 403; medical answers withheld.
             health_viewer — medical answers / medical documents readable; health_fact.* mutations (health.manage) and
                             document review (documents.write) → 403.
             doc_writer    — first review decision, validity and renewal upload succeed; re-review / reopen → 403
                             REREVIEW_NOT_AUTHORIZED.
  reset    lead deletion of L1 / L2 (children, submissions, documents go with them), the form archived, the fact ended
           (health facts are retained as ended data). The registered qa_documents_forms_residue_reset and the 20-check
           census are separate governed acts.

Never prints a cookie, signed URL or answer content: statuses, booleans and counts.
"""
import datetime, json, os, sys, urllib.error, urllib.request, uuid

BASE = "https://staging.workwithalloy.com"
AUTH = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.path.dirname(os.path.abspath(__file__))
RUN = sys.argv[1]
PHASE = sys.argv[2]
TAG = f"qa-authz-{RUN}"
SUFFIX = RUN.split("_", 1)[1]
KEY_PREFIX = f"qa_{SUFFIX}_"
STATE_FILE = os.path.join(HERE, f"r4_hosted_fixture_ids.{RUN}.json")
RESULTS_FILE = os.path.join(HERE, f"r4_hosted_results.{PHASE}.{RUN}.json")
WU1 = "aa000000-0000-4000-8000-000000000101"  # QA D1
WU2 = "aa000000-0000-4000-8000-000000000102"  # QA D2
A, SF, HV, DW = "fixture_admin", "scoped_forms", "health_viewer", "doc_writer"
ALLERGY = "qa-r4-allergy-answer"
NOTE = "qa-r4-standard-answer"
MEDICAL_TYPES = {"immunization_record", "physical", "health_care_plan", "medication_authorization"}
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
    text = f"QA authz R4 fixture {label}"
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


def load():
    return json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {}


def save(ids):
    json.dump(ids, open(STATE_FILE, "w"), indent=2)


def create_lead(name, wu):
    s, b = j("/api/admin/actions/execute", A, {
        "action_key": "create_lead", "entity_type": "opportunity", "mode": "execute",
        "payload": {"first_name": f"QA R4 {name}", "last_name": SUFFIX, "email": f"qa-r4-{SUFFIX}-{name.lower()}@example.com"},
        "context": {"work_unit_id": wu, "surface": "work_unit"},
    })
    data = (b or {}).get("data") or {} if isinstance(b, dict) else {}
    er = data.get("execution_result") or {}
    detail = er.get("detail") or {} if isinstance(er, dict) else {}
    opp = data.get("affected_id") or detail.get("opportunity_id") or (er.get("affectedId") if isinstance(er, dict) else None)
    print(f"create_lead {name}: status={s} has_opp={bool(opp)}")
    return opp


def household_of(opp):
    s, b = call(f"/api/admin/documents/library?subject_type=opportunity&subject_id={opp}", A)
    return (((b or {}).get("library") or {}).get("household") or {}).get("id") if isinstance(b, dict) else None


def add_child(hh, first):
    s, b = j("/api/admin/customer-members", A, {"customer_id": hh, "display_name": f"QA R4 {first} {SUFFIX}", "relationship": "child",
                                                 "first_name": f"QA R4 {first}", "last_name": SUFFIX})
    row = ((b or {}).get("member") or (b or {}).get("row") or (b or {}).get("data") or b) if isinstance(b, dict) else {}
    if isinstance(row, dict) and isinstance(row.get("member"), dict):
        row = row["member"]
    mid = row.get("id") if isinstance(row, dict) else None
    print(f"child {first}: status={s} has_id={bool(mid)}")
    return mid


def upload(persona, child_id, doc_type, stem):
    body, ct = multipart({"entity_type": "customer_member", "entity_id": child_id, "doc_type": doc_type, "title": f"{TAG} {stem}"},
                         f"{TAG}-{stem}.pdf", tiny_pdf(stem), "application/pdf")
    s, b = call("/api/admin/documents/upload", persona, "POST", body, ct)
    dd = (b or {}).get("document") if isinstance(b, dict) else None
    return s, b, (dd.get("id") if isinstance(dd, dict) else None)


def execute(persona, action_key, child, payload):
    s, b = j("/api/admin/actions/execute", persona, {"action_key": action_key, "entity_type": "child", "entity_id": child,
                                                    "payload": payload, "mode": "execute", "context": {"surface": "work_unit"}})
    data = (b or {}).get("data") or {} if isinstance(b, dict) else {}
    return s, b, data.get("execution_result") or {}, data.get("affected_id")


def submit(persona, version_id, subj):
    return j("/api/admin/forms/submissions", persona, {"form_definition_version_id": version_id, **subj,
                                                       "payload": {"values": {"child_note": f"{NOTE} {TAG}", "allergy_list": f"{ALLERGY} {TAG}"}}})


# ---------------------------------------------------------------------------------------------------------------- ensure
if PHASE == "ensure":
    ids = load()
    for k, wu in (("L1", WU1), ("L2", WU2)):
        if k not in ids:
            opp = create_lead(k, wu)
            if not opp:
                sys.exit(1)
            ids[k] = {"opp": opp, "hh": household_of(opp)}
            save(ids)
    for k, lead, first in (("K1", "L1", "Kid One"), ("KU", "L2", "Kid Unscoped")):
        if k not in ids:
            mid = add_child(ids[lead]["hh"], first)
            if not mid:
                sys.exit(1)
            ids[k] = mid
            save(ids)
    if "form" not in ids:
        s, b = j("/api/admin/forms", A, {"name": f"{TAG} R4 scope form", "key": f"{KEY_PREFIX}r4form", "kind": "center", "is_active": True,
                                         "description": "R4 hosted certification fixture"})
        fid = ((b or {}).get("data") or {}).get("id")
        schema = {"schema_version": 1, "title": f"{TAG} R4 scope form",
                  "sections": [{"id": "s1", "title": "Child", "field_ids": ["child_note", "allergy_list"]}],
                  "fields": [{"id": "child_note", "label": "Note", "type": "text", "required": False},
                             {"id": "allergy_list", "label": "Allergies", "type": "text", "required": False,
                              "field_source": {"entity_type": "child", "field_key": "allergies", "shared_value_key": "child_allergies"}}]}
        s2, b2 = j(f"/api/admin/forms/{fid}/versions", A, {"schema_json": schema})
        vid = ((b2 or {}).get("data") or {}).get("id")
        s3, b3 = call(f"/api/admin/forms/{fid}/versions/{vid}/publish", A, "POST", b"{}", "application/json")
        print(f"form: create={s} version={s2} publish={s3}")
        if not (fid and vid and s3 == 200):
            sys.exit(1)
        ids["form"] = {"id": fid, "version_id": vid}
        save(ids)
    subs = ids.setdefault("subs", {})
    for k, subj in {"s_opp1": {"opportunity_id": ids["L1"]["opp"]}, "s_opp2": {"opportunity_id": ids["L2"]["opp"]},
                    "s_ku": {"customer_member_id": ids["KU"]}}.items():
        if k not in subs:
            s, b = submit(A, ids["form"]["version_id"], subj)
            sid = ((b or {}).get("data") or {}).get("id")
            print(f"submission {k}: status={s} has_id={bool(sid)}")
            if not sid:
                sys.exit(1)
            subs[k] = sid
            save(ids)
    docs = ids.setdefault("docs", {})
    if "plain" not in docs:
        s, b = call("/api/admin/documents/configuration", A)
        types = [t for t in ((b or {}).get("document_types") or (b or {}).get("types") or []) if isinstance(t, dict)]
        keys = [t.get("key") or t.get("type_key") for t in types]
        plain = next((k for k in ("birth_certificate", "custody_document", "other", "general") if k in keys), None) or "other"
        s, b, did = upload(A, ids["K1"], plain, "plain-k1")
        print(f"plain document ({plain}): status={s} has_id={bool(did)} code={code_of(b)}")
        if not did:
            sys.exit(1)
        docs["plain"], docs["plain_type"] = did, plain
        save(ids)
    if "medical" not in docs:
        s, b, did = upload(A, ids["K1"], "immunization_record", "imm-k1")
        print(f"medical document: status={s} has_id={bool(did)} code={code_of(b)}")
        if not did:
            sys.exit(1)
        docs["medical"] = did
        save(ids)
    if "fact" not in ids:
        s, b, er, fact = execute(A, "health_fact.add", ids["K1"], {"fact_kind": "immunization", "payload": {"vaccine_key": "mmr", "doses": [{"dose_number": 1, "administered_on": "2022-05-01"}]}})
        print(f"immunization fact: status={s} has_id={bool(fact)} code={code_of(b)}")
        if not fact:
            sys.exit(1)
        ids["fact"] = fact
        save(ids)
    print("ENSURE", json.dumps({k: (bool(v) if not isinstance(v, dict) else {x: bool(y) for x, y in v.items()}) for k, v in ids.items()}))
    sys.exit(0)

results = []


def check(section, case, persona, ok, status, code=None, **extra):
    results.append({"section": section, "case": case, "persona": persona, "pass": bool(ok), "status": status, "code": code, **extra})
    print(("PASS " if ok else "FAIL ") + f"[{section}][{persona}] {case} :: status={status} code={code}" + (f" {json.dumps(extra)}" if extra else ""))


def finish():
    summary = {"passed": sum(1 for r in results if r["pass"]), "total": len(results)}
    by = {}
    for r in results:
        x = by.setdefault(r["section"], {"passed": 0, "total": 0})
        x["total"] += 1
        x["passed"] += 1 if r["pass"] else 0
    json.dump({"run": RUN, "phase": PHASE, "contract_sha256": "e6d619f2796c099b8a57592e6a556e58150537a3175388f48eb250e133c03b6e",
               "summary": summary, "sections": by, "results": results}, open(RESULTS_FILE, "w"), indent=2)
    print("SECTIONS", json.dumps(by))
    print("SUMMARY", json.dumps(summary))
    sys.exit(0 if summary["passed"] == summary["total"] else 1)


# --------------------------------------------------------------------------------------------------------------- certify
if PHASE == "certify":
    ids = load()
    subs, docs = ids["subs"], ids["docs"]
    L1, L2, K1, KU = ids["L1"]["opp"], ids["L2"]["opp"], ids["K1"], ids["KU"]
    vid = ids["form"]["version_id"]

    def leaks(b):
        raw = json.dumps(b)
        return any(x in raw for x in (TAG, NOTE, ALLERGY))

    def sub_ids(b):
        d = (b or {}).get("data") if isinstance(b, dict) else None
        return {r.get("id") for r in d} if isinstance(d, list) else set()

    # ═══════════════════════════════════════════════════════════════════════════ scoped_forms (department QA D1)
    S = "R4-scoped_forms"
    s, b = submit(SF, vid, {"opportunity_id": L1})
    mine = ((b or {}).get("data") or {}).get("id") if isinstance(b, dict) else None
    if mine:
        subs["s_sf_opp1"] = mine
        save(ids)
    check(S, "create a submission on the in-scope (QA D1) opportunity", SF, s in (200, 201) and bool(mine), s, code_of(b))
    if mine:
        s, b = call(f"/api/admin/forms/submissions/{mine}", SF)
        check(S, "read its own in-scope submission", SF, s == 200 and ((b or {}).get("data") or {}).get("id") == mine, s, code_of(b))
    s, b = call(f"/api/admin/forms/submissions/{subs['s_opp1']}", SF)
    d = ((b or {}).get("data") or {}) if isinstance(b, dict) else {}
    check(S, "read the admin's in-scope submission", SF, s == 200 and d.get("id") == subs["s_opp1"], s, code_of(b))
    p = d.get("payload") or {}
    vals = p.get("values") or {}
    check(S, "medical answer withheld (no health.view): allergy absent and flagged, standard answer kept", SF,
          s == 200 and "allergy_list" not in vals and ALLERGY not in json.dumps(b) and NOTE in str(vals.get("child_note"))
          and (p.get("meta") or {}).get("medical_answers_withheld") is True, s, None, withheld=(p.get("meta") or {}).get("medical_answers_withheld"))
    s, b = call(f"/api/admin/forms/submissions?limit=500&opportunity_id={L1}", SF)
    got = sub_ids(b)
    check(S, "list filtered by the in-scope opportunity returns the run's in-scope submissions", SF,
          s == 200 and subs["s_opp1"] in got and (not mine or mine in got) and ALLERGY not in json.dumps(b), s, None, listed=len(got))
    for path, name in ((f"/api/admin/opportunities/{L1}/intake-source", "intake-source"), (f"/api/admin/opportunities/{L1}/enrollment-packets", "enrollment-packets")):
        s, b = call(path, SF)
        check(S, f"{name} for the in-scope opportunity is served", SF, s == 200, s, code_of(b))
    # out of scope: 404 (scope), never 403 (capability — scoped_forms HOLDS forms.submissions)
    s, b = submit(SF, vid, {"opportunity_id": L2})
    check(S, "create on the QA D2 opportunity → 404 (scope, not capability)", SF, s == 404 and not leaks(b), s, code_of(b))
    s, b = submit(SF, vid, {"customer_member_id": KU})
    check(S, "create on an out-of-scope child (QA D2 household) → 404", SF, s == 404 and not leaks(b), s, code_of(b))
    for k, why in (("s_opp2", "QA D2 opportunity"), ("s_ku", "out-of-scope child")):
        s, b = call(f"/api/admin/forms/submissions/{subs[k]}", SF)
        check(S, f"read {k} ({why}) → 404 and names nothing", SF, s == 404 and not leaks(b), s, code_of(b))
    for q, why in ((f"&opportunity_id={L2}", "QA D2 opportunity"), (f"&customer_member_id={KU}", "out-of-scope child")):
        s, b = call(f"/api/admin/forms/submissions?limit=500{q}", SF)
        got = sub_ids(b) & set(subs.values())
        check(S, f"list filtered by an out-of-scope subject ({why}) is empty, not a refusal", SF, s == 200 and not got and not leaks(b), s, None)
    for path, name in ((f"/api/admin/opportunities/{L2}/intake-source", "intake-source"), (f"/api/admin/opportunities/{L2}/enrollment-packets", "enrollment-packets")):
        s, b = call(path, SF)
        check(S, f"{name} for the QA D2 opportunity → 404", SF, s == 404 and not leaks(b), s, code_of(b))
    s, b = j("/api/admin/forms/packet-links", SF, {"launch_from_entity": {"entity_type": "opportunity", "entity_id": L2}})
    check(S, "packet link launched from the QA D2 opportunity → 404 (scope gate before mint)", SF, s == 404 and not leaks(b), s, code_of(b))
    s, b = j("/api/admin/forms/packet-links", SF, {"launch_from_entity": {"entity_type": "opportunity", "entity_id": L1}})
    check(S, "packet link launched from the QA D1 opportunity passes the scope gate (not 404/403; no packet named, so nothing minted)", SF,
          s not in (401, 403, 404) and s != 201, s, code_of(b), note="no packet id supplied; proves scope admission only")
    s, b = j("/api/admin/forms", SF, {"name": f"{TAG} R4 unauthorized form", "key": f"{KEY_PREFIX}r4_sf_form", "kind": "center", "is_active": True})
    if s in (200, 201):
        ids["form_sf_leak"] = ((b or {}).get("data") or {}).get("id")
        save(ids)
    check(S, "authoring (create a form) → 403", SF, s == 403, s, code_of(b))
    fid = ids["form"]["id"]
    s, b = j(f"/api/admin/forms/{fid}/versions", SF, {"schema_json": {"schema_version": 1, "title": "x", "sections": [], "fields": []}})
    check(S, "authoring (new version of the run form) → 403", SF, s == 403, s, code_of(b))

    # ═══════════════════════════════════════════════════════════════════════════ health_viewer
    S = "R4-health_viewer"
    s, b = call(f"/api/admin/forms/submissions/{subs['s_opp1']}", HV)
    vals = (((b or {}).get("data") or {}).get("payload") or {}).get("values") or {} if isinstance(b, dict) else {}
    check(S, "medical answer readable (health.view): allergy answer present", HV, s == 200 and ALLERGY in str(vals.get("allergy_list")), s, code_of(b))
    s, b = call(f"/api/admin/health/card?customer_member_id={K1}", HV)
    vm = (b or {}).get("vm") if isinstance(b, dict) else None
    check(S, "Health card readable", HV, s == 200 and isinstance(vm, dict), s, code_of(b))
    s, b = call(f"/api/admin/documents/{docs['medical']}/signed-url", HV)
    check(S, "medical document readable (signed URL issued)", HV, s == 200, s, code_of(b))
    for key, payload in (("health_fact.verify_immunization", {"fact_id": ids["fact"], "basis": f"{TAG} unauthorized"}),
                         ("health_fact.add", {"fact_kind": "immunization", "payload": {"vaccine_key": "mmr", "doses": [{"dose_number": 2, "administered_on": "2023-05-01"}]}}),
                         ("health_fact.edit", {"fact_id": ids["fact"], "payload": {"vaccine_key": "mmr", "doses": [{"dose_number": 1, "administered_on": "2022-06-01"}]}}),
                         ("health_fact.end", {"fact_id": ids["fact"], "reason": f"{TAG} unauthorized"})):
        s, b, er, aff = execute(HV, key, K1, payload)
        check(S, f"{key} needs health.manage → 403", HV, s == 403 and not aff, s, code_of(b))
    for dk in ("plain", "medical"):
        s, b = j(f"/api/admin/documents/{docs[dk]}/review", HV, {"decision": "accepted"})
        check(S, f"review of the {dk} document needs documents.write → 403", HV, s == 403, s, code_of(b))

    # ═══════════════════════════════════════════════════════════════════════════ doc_writer
    S = "R4-doc_writer"
    plain = docs["plain"]
    s, b = j(f"/api/admin/documents/{plain}/review", DW, {"decision": "accepted"})
    check(S, "first review decision (pending → accepted) with documents.write", DW, s == 200 and (b or {}).get("review_status") == "accepted", s, code_of(b))
    s, b = j(f"/api/admin/documents/{plain}/review", DW, {"decision": "rejected", "reason": f"{TAG} re-review attempt"})
    check(S, "re-review (accepted → rejected) → 403 REREVIEW_NOT_AUTHORIZED", DW, s == 403 and code_of(b) == "REREVIEW_NOT_AUTHORIZED"
          and (b or {}).get("required_permission") == "processing.documents.manage", s, code_of(b), required_permission=(b or {}).get("required_permission"))
    s, b = j(f"/api/admin/documents/{plain}/review", DW, {"decision": "pending", "reason": f"{TAG} reopen attempt"})
    check(S, "reopen (accepted → pending) → 403 REREVIEW_NOT_AUTHORIZED", DW, s == 403 and code_of(b) == "REREVIEW_NOT_AUTHORIZED", s, code_of(b))
    today = datetime.date.today()
    s, b = j(f"/api/admin/documents/{plain}/validity", DW, {"effective_on": None, "expires_on": (today + datetime.timedelta(days=200)).isoformat(),
                                                           "reason": f"{TAG} validity set by doc_writer"}, "PUT")
    check(S, "validity set (PUT /validity)", DW, s == 200, s, code_of(b), expires_on=((b or {}).get("validity") or {}).get("expires_on") if isinstance(b, dict) else None)
    body, ct = multipart({"reason": f"{TAG} renewal by doc_writer"}, f"{TAG}-plain-k1-v2.pdf", tiny_pdf("plain-k1-v2"), "application/pdf")
    s, b = call(f"/api/admin/documents/{plain}/versions", DW, "POST", body, ct)
    check(S, "renewal upload (new version)", DW, s in (200, 201), s, code_of(b))
    s, b = j(f"/api/admin/documents/{plain}/review", DW, {"decision": "accepted"})
    check(S, "first review decision on the renewed (current, pending) version", DW, s == 200 and (b or {}).get("review_status") == "accepted", s, code_of(b))
    s, b = j(f"/api/admin/documents/{docs['medical']}/review", DW, {"decision": "accepted"})
    check(S, "medical document: review refused without health clearance (403/404, nothing named)", DW, s in (403, 404) and not leaks(b), s, code_of(b))
    finish()

# ----------------------------------------------------------------------------------------------------------------- reset
if PHASE == "reset":
    ids = load()
    out = {}
    if ids.get("fact") and ids.get("K1"):
        s, b, er, _ = execute(A, "health_fact.end", ids["K1"], {"fact_id": ids["fact"], "reason": f"{TAG} QA teardown"})
        out["fact_end"] = s
        print(f"health_fact.end: status={s} code={code_of(b)}")
    for k in ("L1", "L2"):
        L = ids.get(k) or {}
        if L.get("opp") and not L.get("deleted"):
            s, b = call(f"/api/admin/opportunities/{L['opp']}/delete", A, "POST", b"{}", "application/json")
            out[f"delete_{k}"] = s
            print(f"lead delete {k}: status={s} code={code_of(b)}")
            if s == 200:
                L["deleted"] = True
                save(ids)
    for fk in ("form", "form_sf_leak"):
        f = ids.get(fk)
        fid = f.get("id") if isinstance(f, dict) else f
        if fid:
            s, b = call(f"/api/admin/forms/{fid}", A, "DELETE")
            out[f"{fk}_delete"] = s
            if s != 200:
                out[f"{fk}_archive"] = call(f"/api/admin/forms/{fid}/archive", A, "POST", b"{}", "application/json")[0]
            print(f"{fk}: delete={s} archive={out.get(fk + '_archive')}")
    gone = {f"sub_{k}": call(f"/api/admin/forms/submissions/{v}", A)[0] for k, v in (ids.get("subs") or {}).items()}
    for k, v in (ids.get("docs") or {}).items():
        if k != "plain_type":
            gone[f"doc_{k}"] = call(f"/api/admin/documents/{v}/signed-url", A)[0]
    for k in ("L1", "L2"):
        if (ids.get(k) or {}).get("opp"):
            gone[f"opp_{k}"] = call(f"/api/admin/opportunities/{ids[k]['opp']}/delete-preview", A)[0]
    out["after"] = gone
    out["all_gone"] = all(v == 404 for v in gone.values())
    out["retained_by_design"] = {"form_definition": "published form archived (Forms never deletes a published definition)",
                                 "health_fact": "ended, retained (health facts are never deleted)"}
    print("RESET", json.dumps(out))
    json.dump(out, open(os.path.join(HERE, f"r4_hosted_reset_results.{RUN}.json"), "w"), indent=2)
    sys.exit(0 if out["all_gone"] else 1)
