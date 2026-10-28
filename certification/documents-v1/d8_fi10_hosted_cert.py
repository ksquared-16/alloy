"""Documents V1 / D8 + EN-FI-10 — hosted Forms → Documents convergence and immunization evidence layers.

Usage: d8_fi10_hosted_cert.py <qa_run_id> ensure|certify [FI10|D8READ "<reason>"]|reset

A run-scoped HOUSEHOLD FIXTURE (one adult, three children, one case), two run-scoped FORMS (`qa_<run>_d8…`), one
run-scoped REQUIREMENT (`qa_<run>_…`) and one synthetic immunization FACT, built only through the deployed product's
own audited routes as the run's fixture_admin session. Every other persona is a probe.

  ensure   create_lead → POST /api/admin/customer-members ×3.
  certify  D8: a form and its version authored and published through Forms; a requirement whose published Forms
           evidence policy names the form (database-validated, immutable once published); a draft never counts; the
           admin-generated completed PDF is a canonical Document owned by the submission's child, with provenance; it
           is pending review, never accepted automatically; another form never counts; acceptance through the D7
           review; a revised policy (`submitted`) counts on submission while the published v1 is unchanged; tenant and
           capability refusals.
           EN-FI-10: reported fact, uploaded certificate, reviewed evidence and Medical verification stay distinct
           layers; only `health_fact.verify_immunization` with health.manage, a basis and the child's own ACCEPTED
           certificate verifies; Documents review never does.
  reset    archive → purge the requirement (qa_run_id) → end the immunization fact (health_fact.end; facts are
           append-only, never deleted) → lead deletion of the household (submissions, generated documents, children)
           → forms: DELETE (refused once published) then archive. Every id is verified gone, and what the product
           cannot delete is RECORDED as residue rather than reported as removed.

Synthetic names/emails only (qa-d8-<run>-*@example.com); titles carry qa-authz-<run>. Never prints a cookie, signed URL,
storage path or content.
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
STATE_FILE = os.path.join(HERE, f"d8_fi10_hosted_fixture_ids.{RUN}.json")
RESULTS_FILE = os.path.join(HERE, f"d8_fi10_hosted_cert_results.{RUN}.json")
RESET_FILE = os.path.join(HERE, f"d8_fi10_hosted_reset_results.{RUN}.json")
REQ = "/api/admin/documents/configuration/requirements"
A = "fixture_admin"
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
    if not isinstance(b, dict):
        return None
    return b.get("code") or (b.get("error") or {}).get("code") if isinstance(b.get("error"), dict) else b.get("code")


def tiny_pdf(label):
    text = f"QA authz D8 fixture {label}"
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


def execute(persona, action_key, child, payload):
    s, b = j("/api/admin/actions/execute", persona, {"action_key": action_key, "entity_type": "child", "entity_id": child,
                                                    "payload": payload, "mode": "execute", "context": {"surface": "work_unit"}})
    data = (b or {}).get("data") or {} if isinstance(b, dict) else {}
    return s, b, data.get("execution_result") or {}, data.get("affected_id")


# ---------------------------------------------------------------------------------------------------------------- ensure
if PHASE == "ensure":
    ids = load()
    if "opportunity" not in ids:
        s, b = j("/api/admin/actions/execute", A, {
            "action_key": "create_lead", "entity_type": "opportunity", "mode": "execute",
            "payload": {"first_name": "QA D8 Adult", "last_name": f"One {SUFFIX}", "email": f"qa-d8-{SUFFIX}-a1@example.com"},
            "context": {"surface": "work_unit"},
        })
        data = (b or {}).get("data") or {} if isinstance(b, dict) else {}
        er = data.get("execution_result") or {}
        detail = er.get("detail") or {} if isinstance(er, dict) else {}
        opp = data.get("affected_id") or detail.get("opportunity_id") or (er.get("affectedId") if isinstance(er, dict) else None)
        print(f"create_lead: status={s} code={code_of(b)} has_opp={bool(opp)}")
        if not opp or detail.get("mode") == "processing_review":
            sys.exit(1)
        ids["opportunity"] = opp
        save(ids)
    s, b = call(f"/api/admin/documents/library?subject_type=opportunity&subject_id={ids['opportunity']}", A)
    lib = (b or {}).get("library") or {}
    hh = (lib.get("household") or {}).get("id")
    print(f"library(case): status={s} household={bool(hh)}")
    if not hh:
        sys.exit(1)
    ids["household"] = hh
    save(ids)
    for k, first in (("childA", "Kid A"), ("childB", "Kid B"), ("childC", "Kid C")):
        if k in ids:
            continue
        s, b = j("/api/admin/customer-members", A, {"customer_id": hh, "display_name": f"QA D8 {first} {SUFFIX}", "relationship": "child",
                                                   "first_name": f"QA D8 {first}", "last_name": SUFFIX})
        row = ((b or {}).get("member") or (b or {}).get("row") or (b or {}).get("data") or b) if isinstance(b, dict) else {}
        if isinstance(row, dict) and isinstance(row.get("member"), dict):
            row = row["member"]
        mid = row.get("id") if isinstance(row, dict) else None
        print(f"customer-member {k}: status={s} has_id={bool(mid)}")
        if not mid:
            sys.exit(1)
        ids[k] = mid
        save(ids)
    print("ENSURE", json.dumps({k: bool(v) for k, v in ids.items()}))
    sys.exit(0)

# --------------------------------------------------------------------------------------------------------------- certify
results = []


def check(section, case, persona, ok, status, code=None, **extra):
    results.append({"section": section, "case": case, "persona": persona, "pass": bool(ok), "status": status, "code": code, **extra})
    print(("PASS " if ok else "FAIL ") + f"[{section}][{persona}] {case} :: status={status} code={code}" + (f" {json.dumps(extra)}" if extra else ""))


ONLY = sys.argv[3] if len(sys.argv) > 3 else None
RAN = {"FI10": {"EN-FI-10"}, "D8READ": {"D8"}}.get(ONLY, set())
RAN_CASES = {"D8READ": {"reading a submission needs forms.submissions",
                        "Forms read contract: without documents admission the linked document's title and file name are withheld",
                        "Forms read contract: a documents reader in scope may see the standard-sensitivity linked document's label",
                        "department-restricted actor: an out-of-scope household's submission answers are not disclosed",
                        "department-restricted actor: an out-of-scope child's linked document is named only 'restricted' (EN-FI-01)",
                        "department-restricted actor: an out-of-scope child's form answers are not disclosed (single read, list)"}}.get(ONLY)
REASON = sys.argv[4] if len(sys.argv) > 4 else None

if PHASE == "certify":
    ids = load()
    hh, cA, cB, cC = ids["household"], ids["childA"], ids["childB"], ids["childC"]
    forms = ids.setdefault("forms", {})
    subs = ids.setdefault("submissions", {})
    docs = ids.setdefault("docs", {})
    reqs = ids.setdefault("requirements", {})
    SECRETS = [TAG, SUFFIX, "QA D8"]

    def leaks(b):
        raw = json.dumps(b)
        return [x for x in SECRETS if x in raw]

    def readiness(p):
        return call(f"/api/admin/documents/requirements/readiness?subject_type=household&subject_id={hh}", p)

    def state_of(b, rid, sid):
        for s in (((b or {}).get("readiness") or {}).get("subjects") or []):
            if s["subject"]["subject_id"] == sid:
                for e in s.get("requirements") or []:
                    if e["requirement_id"] == rid:
                        return e
        return None

    def library(p):
        s, b = call(f"/api/admin/documents/library?subject_type=household&subject_id={hh}", p)
        return s, {x["id"]: x for x in (((b or {}).get("library") or {}).get("documents") or [])} if isinstance(b, dict) else {}

    def review(p, doc, decision, reason=None):
        body = {"decision": decision}
        if reason:
            body["reason"] = reason
        return j(f"/api/admin/documents/{doc}/review", p, body)

    def make_form(name, label):
        if name in forms:
            return forms[name]
        key = f"{KEY_PREFIX}d8{name}"
        s, b = j("/api/admin/forms", A, {"name": f"{TAG} {label}", "key": key, "kind": "center", "is_active": True,
                                         "description": "D8 hosted certification fixture"})
        fid = ((b or {}).get("data") or {}).get("id")
        check("D8", f"form '{name}' created through Forms", A, s == 201 and bool(fid), s, code_of(b))
        schema = {"schema_version": 1, "title": f"{TAG} {label}", "sections": [{"id": "s1", "title": "Child", "field_ids": ["child_note"]}],
                  "fields": [{"id": "child_note", "label": "Note", "type": "text", "required": True}]}
        s, b = j(f"/api/admin/forms/{fid}/versions", A, {"schema_json": schema, "pdf_mapping_json": {"slots": {"Note": {"path": "values.child_note"}}}})
        vid = ((b or {}).get("data") or {}).get("id")
        s, b = call(f"/api/admin/forms/{fid}/versions/{vid}/publish", A, "POST", b"{}", "application/json")
        check("D8", f"form '{name}' version published", A, s == 200 and bool(vid), s, code_of(b))
        forms[name] = {"id": fid, "key": key, "version_id": vid}
        save(ids)
        return forms[name]

    def submit_and_generate(name, form, child, note):
        s, b = j("/api/admin/forms/submissions", A, {"form_definition_version_id": form["version_id"], "customer_member_id": child,
                                                     "payload": {"values": {"child_note": f"{TAG} {note}"}}})
        sid = ((b or {}).get("data") or {}).get("id")
        if sid:
            subs[name] = sid
            save(ids)
        check("D8", f"submission '{name}' created as a draft for the child", A, s == 201 and ((b or {}).get("data") or {}).get("status") == "draft", s, code_of(b))
        return sid

    def generate(sid, persona=A):
        s, b = j(f"/api/admin/forms/submissions/{sid}/generate-document", persona, {})
        return s, b, (b or {}).get("document_id") if isinstance(b, dict) else None

    if ONLY is None:
        # ═══════════════════════════════════════════════════════════════════════════════ D8 Forms → Documents
        S = "D8"
        s, b = j("/api/admin/forms", "doc_reader", {"name": f"{TAG} refused", "key": f"{KEY_PREFIX}d8refused"})
        check(S, "authoring a form needs forms.author", "doc_reader", s == 403, s, code_of(b))
        F1 = make_form("f1", "consent form")
        F2 = make_form("f2", "unrelated form")

        def rq(acceptance, keys):
            return {"label": f"{TAG} enrollment document (Forms evidence)", "document_type_key": "enrollment_document", "subject_type": "child",
                    "scope": {"kind": "all"}, "timing": {"kind": "immediate"}, "policy": "required", "waivable": False,
                    "effective_from": None, "effective_until": None, "form_evidence": {"form_keys": keys, "acceptance": acceptance}}

        s, b = j(REQ, A, {**rq("review", [f"{KEY_PREFIX}d8nonexistent"]), "key": KEY_PREFIX + "d8_badform"})
        bad, bv = (b or {}).get("requirement_id"), (b or {}).get("version_id")
        s, b = j(f"{REQ}/{bad}/validate", A, {"version_id": bv})
        codes = sorted(p.get("code") for p in ((b or {}).get("problems") or []))
        check(S, "a Forms evidence policy naming an unknown form is refused by database validation", A,
              s == 200 and (b or {}).get("valid") is False and "form_evidence_form_unknown" in codes, s, code_of(b), problems=codes)
        call(f"{REQ}/{bad}", A, "DELETE")
        s, b = j(REQ, A, {**rq("review", [F1["key"]]), "key": KEY_PREFIX + "d8_enr"})
        rid, v1 = (b or {}).get("requirement_id"), (b or {}).get("version_id")
        reqs["d8_enr"] = rid
        save(ids)
        s, b = j(f"{REQ}/{rid}/validate", A, {"version_id": v1})
        check(S, "a policy naming an active form validates", A, s == 200 and (b or {}).get("valid") is True, s, code_of(b), problems=(b or {}).get("problems"))
        s, b = j(f"{REQ}/{rid}/publish", A, {"version_id": v1, "expected_published_version_id": None})
        check(S, "requirement with Forms evidence (needs review) published", A, s == 200, s, code_of(b))
        s, b = readiness(A)
        check(S, "Kid A: missing before any submission", A, (state_of(b, rid, cA) or {}).get("state") == "missing", s)

        sa = submit_and_generate("a_f1", F1, cA, "kid A consent")
        s, b, _ = generate(sa)
        check(S, "a draft submission produces no document", A, s == 409 and code_of(b) == "NOT_SUBMITTED", s, code_of(b))
        s, b = readiness(A)
        check(S, "a draft submission never counts", A, (state_of(b, rid, cA) or {}).get("state") == "missing", s)
        s, b = j(f"/api/admin/forms/submissions/{sa}/submit", "doc_reader", {})
        check(S, "submitting needs forms.submissions", "doc_reader", s == 403, s, code_of(b))
        s, b = j(f"/api/admin/forms/submissions/{sa}/submit", A, {})
        check(S, "submission submitted", A, s == 200 and ((b or {}).get("data") or {}).get("status") == "submitted", s, code_of(b))
        s, b, _ = generate(sa, "doc_reader")
        check(S, "generating needs forms.submissions", "doc_reader", s == 403, s, code_of(b))
        s, b, da = generate(sa)
        docs["a_f1"] = da
        save(ids)
        check(S, "the completed form PDF is generated as a canonical document", A, s == 200 and bool(da) and (b or {}).get("reused") is False, s, code_of(b))
        s, b, da2 = generate(sa)
        check(S, "generation is idempotent (the same document, not a copy)", A, s == 200 and da2 == da and (b or {}).get("reused") is True, s, code_of(b))

        s, lib = library(A)
        row = lib.get(da) or {}
        fp = row.get("form_provenance") or {}
        owner = row.get("owner") or {}
        check(S, "library: one canonical Document of type Completed form", A, s == 200 and (row.get("type") or {}).get("key") == "generated_form_pdf", s, None,
              type=(row.get("type") or {}).get("key"))
        check(S, "attribution: owned by the submission's child, not the household or a sibling", A,
              (owner.get("subject_id") or owner.get("id")) == cA and json.dumps(owner).find(cB) < 0, s, None, owner_type=owner.get("subject_type") or owner.get("type"))
        check(S, "provenance: form, submission, status and artifact kind read from the existing links", A,
              fp.get("form_key") == F1["key"] and fp.get("form_submission_id") == sa and fp.get("submission_status") == "submitted"
              and fp.get("role") == "generated_pdf" and fp.get("kind") in ("completed", "generated"), s, None,
              provenance={k: fp.get(k) for k in ("role", "kind", "submission_status", "integrity")})
        check(S, "integrity is stated (verified / unrecorded), never a mismatch for an untampered artifact", A, fp.get("integrity") in ("verified", "unrecorded"), s, None, integrity=fp.get("integrity"))
        cv = row.get("current_version") or {}
        check(S, "one immutable version", A, row.get("version_count") == 1 and bool(cv.get("id")), s, None, version_count=row.get("version_count"))
        s, b = call(f"/api/admin/forms/submissions/{sa}", A)
        linked = json.dumps(((b or {}).get("data") or {}).get("linked_documents"))
        check(S, "Forms keeps its own view of the artifact (linked_documents)", A, s == 200 and da in linked, s, code_of(b))

        s, b = readiness(A)
        e = state_of(b, rid, cA) or {}
        ev = e.get("evidence") or {}
        check(S, "Forms evidence is pending review — never accepted automatically", A,
              e.get("state") == "pending_review" and da in ev.get("pending", []) and da not in ev.get("accepted", []), s, None, state=e.get("state"))
        check(S, "readiness names the evidence as coming from Forms", A, da in json.dumps(ev.get("from_forms")), s)
        check(S, "the sibling is unaffected", A, (state_of(b, rid, cB) or {}).get("state") == "missing", s)

        sb = submit_and_generate("b_f2", F2, cB, "kid B unrelated")
        j(f"/api/admin/forms/submissions/{sb}/submit", A, {})
        s, b, db = generate(sb)
        docs["b_f2"] = db
        save(ids)
        s, b = readiness(A)
        e = state_of(b, rid, cB) or {}
        check(S, "a completed form the policy does not name never counts", A, bool(db) and e.get("state") == "missing", s, None, state=e.get("state"))

        s, b = review(A, da, "accepted")
        check(S, "Forms evidence accepted through the D7 review", A, s == 200 and (b or {}).get("review_status") == "accepted", s, code_of(b))
        s, b = readiness(A)
        e = state_of(b, rid, cA) or {}
        check(S, "D6 requirement satisfied by eligible, accepted Forms evidence", A, e.get("state") == "satisfied" and da in (e.get("evidence") or {}).get("accepted", []), s, None, state=e.get("state"))

        s, b = j(f"{REQ}/{rid}/draft", A, rq("submitted", [F1["key"]]), "PUT")
        v2 = (b or {}).get("version_id")
        j(f"{REQ}/{rid}/validate", A, {"version_id": v2})
        s, b = j(f"{REQ}/{rid}/publish", A, {"version_id": v2, "expected_published_version_id": v1})
        check(S, "a revised policy (counts on submission) publishes as a new version", A, s == 200 and (b or {}).get("superseded_version_id") == v1, s, code_of(b))
        s, b = call(f"{REQ}/{rid}", A)
        vers = {v["id"]: v for v in ((b or {}).get("versions") or [])}
        fe1 = (vers.get(v1) or {}).get("form_evidence") or {}
        fe2 = (vers.get(v2) or {}).get("form_evidence") or {}
        check(S, "the published v1 policy is unchanged (immutable); v2 carries the new acceptance", A,
              fe1.get("acceptance") == "review" and fe2.get("acceptance") == "submitted", s, code_of(b), v1=fe1, v2=fe2)
        sc = submit_and_generate("b_f1", F1, cB, "kid B consent")
        j(f"/api/admin/forms/submissions/{sc}/submit", A, {})
        s, b, dc = generate(sc)
        docs["b_f1"] = dc
        save(ids)
        s, b = readiness(A)
        e = state_of(b, rid, cB) or {}
        check(S, "under an explicit 'counts on submission' policy the submitted form satisfies", A, e.get("state") == "satisfied", s, None, state=e.get("state"))

        s, b = call(f"/api/admin/forms/submissions/{sa}", "cross_org_admin")
        check(S, "another organization: the submission is not found", "cross_org_admin", s in (403, 404) and not leaks(b), s, code_of(b))
        s, b = call(f"/api/admin/documents/{da}/signed-url", "cross_org_admin")
        check(S, "another organization: the generated document is not found", "cross_org_admin", s == 404 and not leaks(b), s, code_of(b))
        s, lib = library("scoped_ops")
        check(S, "department-restricted actor: the household library is not disclosed", "scoped_ops", da not in lib, s)

    if ONLY in (None, "D8READ"):
        # Forms reads are admin-session reads by contract (formsAuthority gates WRITES: author / submissions / confirm);
        # since EN-FI-01 a submission names a linked document only to a reader who may read that document.
        S = "D8"
        sa, da = subs["a_f1"], docs["a_f1"]
        s, b = call(f"/api/admin/forms/submissions/{sa}", "no_docs")
        ld = json.dumps(((b or {}).get("data") or {}).get("linked_documents")) if isinstance(b, dict) else ""
        check(S, "Forms read contract: without documents admission the linked document's title and file name are withheld", "no_docs",
              s in (200, 403, 404) and "consent form" not in ld and TAG not in ld, s, code_of(b))
        s, b = call(f"/api/admin/forms/submissions/{sa}", "doc_reader")
        ld = json.dumps(((b or {}).get("data") or {}).get("linked_documents")) if isinstance(b, dict) else ""
        check(S, "Forms read contract: a documents reader in scope may see the standard-sensitivity linked document's label", "doc_reader",
              s == 200 and da in ld, s, code_of(b))
        s, b = call(f"/api/admin/forms/submissions/{sa}", "scoped_ops")
        data = ((b or {}).get("data") or {}) if isinstance(b, dict) else {}
        names = [((l or {}).get("document") or {}).get("name") for l in data.get("linked_documents") or []]
        check(S, "department-restricted actor: an out-of-scope child's linked document is named only 'restricted' (EN-FI-01)", "scoped_ops",
              s in (403, 404) or (names and all(n == "Document (restricted)" for n in names) and TAG not in json.dumps(data.get("linked_documents"))), s, code_of(b), names=names)
        answers = TAG in json.dumps(data.get("payload"))
        s2, b2 = call(f"/api/admin/forms/submissions?customer_member_id={cA}", "scoped_ops")
        listed = TAG in json.dumps(b2)
        # FINDING (pre-existing Forms read path, not D7/D8): Forms submission reads apply no subject scope.
        check(S, "department-restricted actor: an out-of-scope child's form answers are not disclosed (single read, list)", "scoped_ops",
              (s in (403, 404) or not answers) and (s2 in (403, 404) or not listed), s, code_of(b),
              single_read_status=s, single_read_answers_disclosed=answers, list_status=s2, list_answers_disclosed=listed,
              documents_api_for_same_actor="404 on library, readiness, signed-url, history")

    if ONLY in (None, "FI10"):
        # ═══════════════════════════════════════════════════════════════════════════════ EN-FI-10 immunization layers
        S = "EN-FI-10"
        if ONLY == "FI10":
            # A verified fact cannot be un-verified: a rerun needs a child with no history.
            s, b = j("/api/admin/customer-members", A, {"customer_id": hh, "display_name": f"QA D8 Kid D {SUFFIX}", "relationship": "child",
                                                       "first_name": "QA D8 Kid D", "last_name": SUFFIX})
            row = ((b or {}).get("member") or (b or {}).get("row") or (b or {}).get("data") or b) if isinstance(b, dict) else {}
            if isinstance(row, dict) and isinstance(row.get("member"), dict):
                row = row["member"]
            cC = row.get("id")
            ids["childD"] = cC
            ids["fact_first_attempt"] = ids.get("fact")
            save(ids)

        def card(p=A):
            s, b = call(f"/api/admin/health/card?customer_member_id={cC}", p)
            vm = (b or {}).get("vm") or {} if isinstance(b, dict) else {}
            return s, b, vm.get("immunizationEvidence") or {}

        s, b, ie = card()
        check(S, "nothing on file", A, s == 200 and ie.get("summary") == "nothing_on_file", s, code_of(b), summary=ie.get("summary"))
        for p in ("doc_reader", "processing_only"):
            s, b, _ = card(p)
            check(S, "the Health card needs health.view", p, s == 403 and not leaks(b), s, code_of(b))
        s, b, er, aff = execute("doc_reader", "health_fact.add", cC, {"fact_kind": "immunization", "payload": {"vaccine_key": "mmr", "doses": [{"dose_number": 1, "administered_on": "2022-05-01"}]}})
        check(S, "reporting a fact needs health.manage", "doc_reader", s in (401, 403), s, code_of(b))
        s, b, er, fact = execute(A, "health_fact.add", cC, {"fact_kind": "immunization", "payload": {"vaccine_key": "mmr", "doses": [{"dose_number": 1, "administered_on": "2022-05-01"}]}})
        if fact:
            ids["fact"] = fact
            save(ids)
        check(S, "a reported immunization fact (operator source)", A, s == 200 and bool(fact), s, code_of(b))
        s, b, ie = card()
        check(S, "layer: reported only — not verified", A, ie.get("summary") == "reported_only" and (ie.get("medical") or {}).get("state") == "unverified" and (ie.get("medical") or {}).get("verified") == 0, s, None,
              summary=ie.get("summary"), medical=(ie.get("medical") or {}).get("state"))
        body, ct = multipart({"entity_type": "customer_member", "entity_id": cC, "doc_type": "immunization_record", "title": f"{TAG} certificate"},
                             f"{TAG}-certificate.pdf", tiny_pdf("certificate"), "application/pdf")
        s, b = call("/api/admin/documents/upload", A, "POST", body, ct)
        cert = ((b or {}).get("document") or {}).get("id") if isinstance(b, dict) else None
        docs["c_cert"] = cert
        save(ids)
        s, b, ie = card()
        cs = ie.get("certificate") or {}
        check(S, "layer: uploaded certificate is distinct from the reported fact", A, cs.get("state") == "uploaded" and cs.get("reviewed") is False
              and ie.get("summary") == "certificate_uploaded" and (ie.get("medical") or {}).get("state") == "unverified" and (ie.get("medical") or {}).get("verified") == 0, s, None, summary=ie.get("summary"), certificate=cs.get("state"))
        s, b, er, _ = execute(A, "health_fact.verify_immunization", cC, {"fact_id": fact, "basis": f"{TAG} certificate reviewed", "evidence_document_id": cert})
        check(S, "verification refuses a certificate whose version is not accepted", A, s in (400, 409, 422), s, code_of(b))
        s, b = review(A, cert, "rejected", f"{TAG} unreadable certificate")
        s, b, ie = card()
        check(S, "layer: a rejected certificate is reviewed, not accepted, not verified", A, (ie.get("certificate") or {}).get("state") == "rejected"
              and (ie.get("medical") or {}).get("state") == "unverified" and (ie.get("medical") or {}).get("verified") == 0, s, None, summary=ie.get("summary"))
        s, b = review(A, cert, "accepted", f"{TAG} readable on rescan")
        s, b, ie = card()
        check(S, "layer: an ACCEPTED certificate beside a reported fact is accepted-unverified — review never verifies", A,
              ie.get("summary") == "certificate_accepted_unverified" and (ie.get("certificate") or {}).get("state") == "accepted"
              and (ie.get("medical") or {}).get("state") == "unverified" and (ie.get("medical") or {}).get("verified") == 0, s, None, summary=ie.get("summary"))
        s, b, er, _ = execute(A, "health_fact.verify_immunization", cC, {"fact_id": fact, "basis": "ok", "evidence_document_id": cert})
        check(S, "verification needs a stated basis", A, s in (400, 422), s, code_of(b))
        body, ct = multipart({"entity_type": "customer_member", "entity_id": cA, "doc_type": "immunization_record", "title": f"{TAG} sibling certificate"},
                             f"{TAG}-sibling-certificate.pdf", tiny_pdf("sibling"), "application/pdf")
        s, b = call("/api/admin/documents/upload", A, "POST", body, ct)
        sib = ((b or {}).get("document") or {}).get("id") if isinstance(b, dict) else None
        docs["a_cert"] = sib
        save(ids)
        review(A, sib, "accepted")
        s, b, er, _ = execute(A, "health_fact.verify_immunization", cC, {"fact_id": fact, "basis": f"{TAG} sibling certificate", "evidence_document_id": sib})
        check(S, "verification refuses another child's certificate", A, s in (400, 403, 404, 409, 422), s, code_of(b))
        s, b, er, _ = execute("doc_reader", "health_fact.verify_immunization", cC, {"fact_id": fact, "basis": f"{TAG} unauthorized", "evidence_document_id": cert})
        check(S, "verification needs health.manage", "doc_reader", s in (401, 403), s, code_of(b))
        s, b, er, _ = execute("cross_org_admin", "health_fact.verify_immunization", cC, {"fact_id": fact, "basis": f"{TAG} cross org", "evidence_document_id": cert})
        check(S, "another organization cannot verify", "cross_org_admin", s in (403, 404) and not leaks(b), s, code_of(b))
        s, b, ie = card()
        check(S, "after every refusal the fact is still unverified", A, (ie.get("medical") or {}).get("state") == "unverified" and (ie.get("medical") or {}).get("verified") == 0, s)
        s, b, er, _ = execute(A, "health_fact.verify_immunization", cC, {"fact_id": fact, "basis": f"{TAG} certificate matches the reported dose", "evidence_document_id": cert})
        detail = (er.get("detail") if isinstance(er, dict) and "detail" in er else er) or {}
        check(S, "the one explicit Medical verification with health.manage, a basis and the child's own accepted certificate", A,
              s == 200 and bool(detail.get("confirmed_at")) and detail.get("already_verified") is False, s, code_of(b), detail_keys=sorted(detail.keys()) if isinstance(detail, dict) else None)
        s, b, ie = card()
        check(S, "layer: verified only after the verification act", A, ie.get("summary") == "verified" and (ie.get("medical") or {}).get("state") == "verified" and (ie.get("medical") or {}).get("verified") == (ie.get("medical") or {}).get("total") == 1, s, None, summary=ie.get("summary"))
        s, b, er, _ = execute(A, "health_fact.verify_immunization", cC, {"fact_id": fact, "basis": f"{TAG} again", "evidence_document_id": cert})
        detail = (er.get("detail") if isinstance(er, dict) and "detail" in er else er) or {}
        check(S, "re-verification is idempotent (already verified), never a second stamp", A, s == 200 and detail.get("already_verified") is True, s, code_of(b))

    superseded = []
    if ONLY and os.path.exists(RESULTS_FILE):
        # A section rerun replaces only what it re-ran; the replaced results are kept, never discarded.
        prev = json.load(open(RESULTS_FILE))
        superseded = prev.get("superseded_attempts") or []
        replaced = lambda r: r["section"] in RAN and (RAN_CASES is None or r["case"] in RAN_CASES)  # noqa: E731
        superseded.append({"rerun": ONLY, "replaced_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                           "reason": REASON, "results": [r for r in prev["results"] if replaced(r)]})
        results = [r for r in prev["results"] if not replaced(r)] + results
    summary = {"passed": sum(1 for r in results if r["pass"]), "total": len(results)}
    by = {}
    for r in results:
        x = by.setdefault(r["section"], {"passed": 0, "total": 0})
        x["total"] += 1
        x["passed"] += 1 if r["pass"] else 0
    json.dump({"run": RUN, "summary": summary, "sections": by, "results": results, "superseded_attempts": superseded}, open(RESULTS_FILE, "w"), indent=2)
    print("SECTIONS", json.dumps(by))
    print("SUMMARY", json.dumps(summary))
    sys.exit(0 if summary["passed"] == summary["total"] else 1)

# ----------------------------------------------------------------------------------------------------------------- reset
if PHASE == "reset":
    ids = load()
    out, residue = {}, []
    for name, rid in (ids.get("requirements") or {}).items():
        s, b = call(f"{REQ}/{rid}", A)
        if s == 200 and ((b or {}).get("requirement") or {}).get("status") != "archived":
            j(f"{REQ}/{rid}", A, {"action": "archive"}, "PATCH")
        s, b = call(f"{REQ}/{rid}?qa_run_id={RUN}", A, "DELETE")
        out[f"purge_{name}"] = {"status": s, "purged": (b or {}).get("purged") if isinstance(b, dict) else None}
        print(f"purge {name}: status={s} {json.dumps(out[f'purge_{name}'])}")
    facts = [(ids.get("fact_first_attempt"), ids.get("childC")), (ids.get("fact"), ids.get("childD") or ids.get("childC"))]
    for n, (fact, child) in enumerate(f for f in facts if f[0]):
        s, b, er, _ = execute(A, "health_fact.end", child, {"fact_id": fact, "reason": f"{TAG} QA teardown"})
        out[f"fact_end_{n}"] = s
        print(f"health_fact.end: status={s} code={code_of(b)}")
        residue.append({"table": "person_health_facts", "id": fact, "state": "ended" if s == 200 else "active",
                        "why": "append-only by design; no delete route; no FK to the child, so it outlives lead deletion"})
    if ids.get("opportunity"):
        s, b = call(f"/api/admin/opportunities/{ids['opportunity']}/delete-preview", A)
        pv = (b or {}).get("preview") or {} if isinstance(b, dict) else {}
        out["delete_preview"] = pv.get("counts")
        print(f"delete-preview: status={s} blocked={pv.get('blocked')} counts={json.dumps(pv.get('counts'))}")
        s, b = call(f"/api/admin/opportunities/{ids['opportunity']}/delete", A, "POST", b"{}", "application/json")
        out["lead_delete"] = s
        print(f"lead delete: status={s} ok={(b or {}).get('ok') if isinstance(b, dict) else None}")
    for name, f in (ids.get("forms") or {}).items():
        s, b = call(f"/api/admin/forms/{f['id']}", A, "DELETE")
        out[f"form_delete_{name}"] = s
        print(f"form delete {name}: status={s}")
        if s != 200:
            s2, b2 = call(f"/api/admin/forms/{f['id']}/archive", A, "POST", b"{}", "application/json")
            out[f"form_archive_{name}"] = s2
            print(f"form archive {name}: status={s2}")
            residue.append({"table": "form_definitions (+ its published version)", "id": f["id"], "key": f["key"],
                            "state": "archived" if s2 == 200 else "active",
                            "why": "a form with a published version can only be archived through the product"})
    gone = {}
    for name, rid in (ids.get("requirements") or {}).items():
        gone[f"requirement_{name}"] = call(f"{REQ}/{rid}", A)[0]
    for key, did in (ids.get("docs") or {}).items():
        if did:
            gone[f"doc_{key}"] = call(f"/api/admin/documents/{did}/signed-url", A)[0]
    for key, sid in (ids.get("submissions") or {}).items():
        gone[f"submission_{key}"] = call(f"/api/admin/forms/submissions/{sid}", A)[0]
    gone["household_library"] = call(f"/api/admin/documents/library?subject_type=household&subject_id={ids['household']}", A)[0]
    out["after"] = gone
    out["all_deletable_gone"] = all(v == 404 for v in gone.values())
    out["recorded_residue"] = residue
    print("RESET", json.dumps(out))
    json.dump(out, open(RESET_FILE, "w"), indent=2)
    sys.exit(0 if out["all_deletable_gone"] else 1)
