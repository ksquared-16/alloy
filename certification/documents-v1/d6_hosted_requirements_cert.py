"""Documents V1 / D6 — hosted document requirement certification (authz_q1 personas).

Usage: d6_hosted_requirements_cert.py <qa_run_id> ensure|certify|reset

A run-scoped HOUSEHOLD FIXTURE (one adult, two children, one case) and run-scoped REQUIREMENTS (keys `qa_<run>_…`, the
namespace the D6 QA fixture purge is bound to), built and removed only through the deployed product's own audited routes,
as the run's fixture_admin session:

  ensure   create_lead → POST /api/admin/customer-members ×2.
  certify  the D6 gates through real HTTP from every persona: requirement authoring (draft → validate → publish, CAS,
           database validation, delete-vs-archive), the evaluator's states through readiness and work (missing,
           satisfied, pending review, rejected, quarantined, waived), version review, waivers (grant, refusals, revoke),
           archive, clearance (a medical requirement is invisible to an actor without health.view), subject scope and
           organization isolation. Since D7 (migration 20261213090000) the re-review step expects D7 semantics — a
           reason is required to change a decided review, and the history keeps every decision — so this driver
           certifies a build that carries D7; its 73/74 record on 1492a2dd (pre-D7) stands as it was run.
  reset    archive → DELETE …/requirements/[id]?qa_run_id=<run> (document_requirement_purge, versions and waivers by
           cascade) → POS delete of the quarantined upload → lead deletion of the household → verifies every id is gone.

Synthetic names/emails only (qa-d6-<run>-*@example.com); titles and file names carry qa-authz-<run>. Never prints a
cookie, signed URL, storage path or content.
"""
import json, os, sys, urllib.request, urllib.error, uuid

BASE = "https://staging.workwithalloy.com"
AUTH = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.path.dirname(os.path.abspath(__file__))
RUN = sys.argv[1]
PHASE = sys.argv[2]
TAG = f"qa-authz-{RUN}"
SUFFIX = RUN.split("_", 1)[1]
KEY_PREFIX = f"qa_{SUFFIX}_"
STATE_FILE = os.path.join(HERE, f"d6_hosted_fixture_ids.{RUN}.json")
RESULTS_FILE = os.path.join(HERE, f"d6_hosted_requirements_cert_results.{RUN}.json")
RESET_FILE = os.path.join(HERE, f"d6_hosted_reset_results.{RUN}.json")
JS_PDF = (b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\n"
          b"trailer\n<< /Root 1 0 R >>\n%%EOF\n")
CFG = "/api/admin/documents/configuration/requirements"
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
    text = f"QA authz D6 fixture {label}"
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


def upload_for_child(persona, child_id, doc_type, stem, content=None):
    body, ct = multipart({"entity_type": "customer_member", "entity_id": child_id, "doc_type": doc_type, "title": f"{TAG} {stem}"},
                         f"{TAG}-{stem}.pdf", content or tiny_pdf(stem), "application/pdf")
    s, b = call("/api/admin/documents/upload", persona, "POST", body, ct)
    d = (b or {}).get("document") if isinstance(b, dict) else None
    return s, b, (d.get("id") if isinstance(d, dict) else None)


def load():
    return json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {}


def save(ids):
    json.dump(ids, open(STATE_FILE, "w"), indent=2)


def email(k):
    return f"qa-d6-{SUFFIX}-{k}@example.com"


# ---------------------------------------------------------------------------------------------------------------- ensure
if PHASE == "ensure":
    ids = load()
    A = "fixture_admin"
    if "opportunity" not in ids:
        s, b = j("/api/admin/actions/execute", A, {
            "action_key": "create_lead", "entity_type": "opportunity", "mode": "execute",
            "payload": {"first_name": "QA D6 Adult", "last_name": f"One {SUFFIX}", "email": email("a1")},
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
    s, b = call(f"/api/admin/documents/library?subject_type=opportunity&subject_id={opp}", A)
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
            "customer_id": hh, "display_name": f"QA D6 {first} {SUFFIX}", "relationship": "child",
            "first_name": f"QA D6 {first}", "last_name": SUFFIX,
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
    print("ENSURE", json.dumps({k: bool(v) for k, v in ids.items()}))
    sys.exit(0)

# --------------------------------------------------------------------------------------------------------------- certify
results = []


def check(case, persona, ok, status, code=None, **extra):
    results.append({"case": case, "persona": persona, "pass": bool(ok), "status": status, "code": code, **extra})
    print(("PASS " if ok else "FAIL ") + f"[{persona}] {case} :: status={status} code={code}" + (f" {json.dumps(extra)}" if extra else ""))


if PHASE == "certify":
    ids = load()
    opp, hh, a1, c1, c2 = ids["opportunity"], ids["household"], ids["adult1"], ids["child1"], ids["child2"]
    A = "fixture_admin"
    SECRETS = [TAG, SUFFIX, "QA D6"]
    reqs = ids.setdefault("requirements", {})
    docs = ids.setdefault("docs", {})
    waivers = ids.setdefault("waivers", {})

    def leaks(b):
        raw = json.dumps(b)
        return [x for x in SECRETS if x in raw]

    def draft(type_key, label, subject="child", policy="required", waivable=False, **over):
        d = {"label": label, "document_type_key": type_key, "subject_type": subject, "scope": {"kind": "all"},
             "timing": {"kind": "immediate"}, "policy": policy, "waivable": waivable, "effective_from": None, "effective_until": None}
        d.update(over)
        return d

    def create(name, body, persona=A):
        s, b = j(CFG, persona, {**body, "key": KEY_PREFIX + name})
        if s == 200 and isinstance(b, dict) and b.get("requirement_id"):
            reqs[name] = b["requirement_id"]
            save(ids)
        return s, b

    def readiness(p, anchor=("household", None), focus=None):
        t, i = anchor
        q = f"/api/admin/documents/requirements/readiness?subject_type={t}&subject_id={i or hh}"
        if focus:
            q += f"&focus_type={focus[0]}&focus_id={focus[1]}"
        return call(q, p)

    def state_of(b, rid, subject_id):
        for s in (((b or {}).get("readiness") or {}).get("subjects") or []):
            if s["subject"]["subject_id"] != subject_id:
                continue
            for e in s.get("requirements") or []:
                if e["requirement_id"] == rid:
                    return e
        return None

    def work(p):
        s, b = call("/api/admin/documents/requirements/work", p)
        return s, b, {r["id"]: r for r in ((b or {}).get("rows") or [])} if isinstance(b, dict) else {}

    def wid(rid, sid):
        return f"document_requirement:{rid}:child:{sid}"

    def review(p, doc, decision, reason=None):
        body = {"decision": decision}
        if reason is not None:
            body["reason"] = reason
        return j(f"/api/admin/documents/{doc}/review", p, body)

    # 0. Clean starting point: no live requirement of the types this run uses may exist in the organization.
    s, b = call(CFG, A)
    live = [r for r in ((b or {}).get("requirements") or []) if r.get("status") == "active" and r.get("published")]
    clash = [r["key"] for r in live if (r["published"] or {}).get("document_type_key") in ("enrollment_document", "immunization_record")
             and (r["published"] or {}).get("subject_type") == "child" and not r["key"].startswith(KEY_PREFIX)]
    check("no pre-existing live child requirement for the run's types", A, s == 200 and not clash, s, code_of(b), clash=clash)

    # 1. Authoring authority.
    for p, want in (("no_docs", 403), ("processing_only", 403)):
        s, b = call(CFG, p)
        check("requirement configuration unreadable without documents.read / documents.manage", p, s == want and not leaks(b), s, code_of(b))
    for p in ("doc_reader", "no_docs", "processing_only", "ocr", "scoped_ops"):
        s, b = j(CFG, p, {**draft("enrollment_document", f"{TAG} unauthorized"), "key": KEY_PREFIX + "unauth_" + p})
        check("creating a requirement needs processing.documents.manage", p, s == 403, s, code_of(b))

    # 2. Draft → database validation refuses an incompatible grain; a never-published requirement deletes.
    s, b = create("bad_grain", draft("immunization_record", f"{TAG} bad grain", subject="household"))
    bad = reqs.get("bad_grain")
    check("draft created (nothing applies yet)", A, s == 200 and b.get("status") == "draft", s, code_of(b))
    s, b = j(f"{CFG}/{bad}/validate", A, {"version_id": (b or {}).get("version_id")})
    codes = sorted(p.get("code") for p in ((b or {}).get("problems") or []))
    check("database validation: a child-only type does not accept the household grain", A,
          s == 200 and b.get("valid") is False and "subject_type_not_accepted_by_type" in codes, s, code_of(b), problems=codes)
    s, b = call(f"{CFG}/{bad}", A, "DELETE")
    check("a never-published requirement can be deleted", A, s == 200 and b.get("deleted") is True and not b.get("purged"), s, code_of(b))
    if s == 200:
        reqs.pop("bad_grain", None)
        save(ids)
    s, b = j(CFG, A, {**draft("enrollment_document", f"{TAG} bad key"), "key": "X bad key"})
    check("an invalid key is refused", A, s == 400 and code_of(b) == "KEY_INVALID", s, code_of(b))

    # 3. R_ENR: required, not waivable, enrollment_document for every child. Validate → publish (CAS).
    s, b = create("enr", draft("enrollment_document", f"{TAG} enrollment form"))
    renr, v1 = reqs.get("enr"), (b or {}).get("version_id")
    s, b = j(f"{CFG}/{renr}/publish", A, {"version_id": v1, "expected_published_version_id": None})
    check("publishing an unvalidated draft is refused", A, s == 409 and code_of(b) == "NOT_VALIDATED", s, code_of(b))
    s, b = j(f"{CFG}/{renr}/validate", A, {"version_id": v1})
    check("valid draft validates", A, s == 200 and b.get("valid") is True, s, code_of(b), problems=(b or {}).get("problems"))
    s, b = j(f"{CFG}/{renr}/publish", A, {"version_id": v1, "expected_published_version_id": str(uuid.uuid4())})
    check("publish is compare-and-swap (stale expected version refused)", A, s == 409 and code_of(b) == "PUBLISH_CONFLICT", s, code_of(b))
    s, b = j(f"{CFG}/{renr}/publish", A, {"version_id": v1, "expected_published_version_id": None})
    check("validated version publishes", A, s == 200 and b.get("version_id") == v1, s, code_of(b))
    s, b = call(f"{CFG}/{renr}", A, "DELETE")
    check("a published requirement cannot be deleted (history kept)", A, s == 409 and code_of(b) == "REQUIREMENT_IN_USE", s, code_of(b))
    s, b = create("enr_dup", draft("enrollment_document", f"{TAG} enrollment dup"))
    rdup = reqs.get("enr_dup")
    s, b = j(f"{CFG}/{rdup}/validate", A, {"version_id": (b or {}).get("version_id")})
    codes = sorted(p.get("code") for p in ((b or {}).get("problems") or []))
    check("one live definition per (type, grain, scope)", A, s == 200 and b.get("valid") is False and "requirement_duplicate" in codes, s, code_of(b), problems=codes)
    s, b = call(f"{CFG}/{rdup}", A, "DELETE")
    if s == 200:
        reqs.pop("enr_dup", None)
        save(ids)

    # 4. Missing → readiness and work.
    s, b = readiness(A)
    e1, e2 = state_of(b, renr, c1), state_of(b, renr, c2)
    check("readiness: the requirement is missing and blocking for both children", A,
          s == 200 and e1 and e2 and e1["state"] == "missing" and e1["blocking"] is True and e2["state"] == "missing", s, code_of(b),
          states=[(e or {}).get("state") for e in (e1, e2)])
    s, b, rows = work(A)
    check("work: one derived row per unmet child, stable id, never a stored task", A,
          s == 200 and rows.get(wid(renr, c1), {}).get("state") == "missing" and wid(renr, c2) in rows, s, code_of(b))
    s, b = readiness(A, ("child", c1))
    check("readiness anchored on a child resolves its household graph", A, s == 200 and state_of(b, renr, c1) is not None, s, code_of(b))

    # 5. Accepted-by-default evidence (enrollment_document needs no review) satisfies.
    s, b, d = upload_for_child(A, c1, "enrollment_document", "enrollment-form")
    docs["enr_c1"] = d
    save(ids)
    check("enrollment form uploaded for child 1", A, s == 200 and bool(d), s, code_of(b))
    s, b = readiness(A)
    e1 = state_of(b, renr, c1)
    check("satisfied by a document that needs no review", A, e1 and e1["state"] == "satisfied" and e1["blocking"] is False and d in e1["evidence"]["accepted"], s, None,
          state=(e1 or {}).get("state"))
    s, b, rows = work(A)
    check("work row disappears once satisfied; the other child's remains", A, wid(renr, c1) not in rows and wid(renr, c2) in rows, s)

    # 6. R_IMM: required, waivable, medical type with review. Clearance and review.
    s, b = create("imm", draft("immunization_record", f"{TAG} immunization", waivable=True))
    rimm = reqs.get("imm")
    vimm = (b or {}).get("version_id")
    j(f"{CFG}/{rimm}/validate", A, {"version_id": vimm})
    s, b = j(f"{CFG}/{rimm}/publish", A, {"version_id": vimm, "expected_published_version_id": None})
    check("medical requirement published", A, s == 200, s, code_of(b))
    s, b = readiness("doc_reader")
    check("reader without health.view: the medical requirement is not shown at all", "doc_reader",
          s == 200 and state_of(b, rimm, c1) is None and state_of(b, renr, c2) is not None, s, code_of(b))
    s, b, rows = work("doc_reader")
    check("reader without health.view: no medical work row is listed or counted", "doc_reader",
          s == 200 and wid(rimm, c1) not in rows and wid(rimm, c2) not in rows and wid(renr, c2) in rows, s, code_of(b))
    s, b = readiness(A)
    check("cleared admin: medical requirement missing for child 1", A, (state_of(b, rimm, c1) or {}).get("state") == "missing", s)

    s, b, d = upload_for_child(A, c1, "immunization_record", "immunization-record")
    docs["imm_c1"] = d
    save(ids)
    s, b = readiness(A)
    e = state_of(b, rimm, c1) or {}
    check("a review-required document on file is pending review, not satisfied", A, e.get("state") == "pending_review" and d in e["evidence"]["pending"], s, None, state=e.get("state"))
    s, b, rows = work(A)
    r = rows.get(wid(rimm, c1)) or {}
    check("work row moves to pending review and names the document", A, r.get("state") == "pending_review" and d in (r.get("pending_document_ids") or []), s)

    for p in ("doc_reader", "ocr"):
        s, b = review(p, d, "accepted")
        check("review needs documents.write", p, s == 403, s, code_of(b))
    s, b = review("cross_org_admin", d, "accepted")
    check("cross-organization review is not found", "cross_org_admin", s == 404 and not leaks(b), s, code_of(b))
    s, b = review(A, d, "rejected")
    check("a rejection needs a reason", A, s == 400 and code_of(b) == "REASON_REQUIRED", s, code_of(b))
    s, b = review(A, d, "rejected", f"{TAG} illegible")
    check("rejection recorded", A, s == 200 and b.get("review_status") == "rejected", s, code_of(b))
    s, b = readiness(A)
    e = state_of(b, rimm, c1) or {}
    check("rejected evidence blocks (evidence_rejected)", A, e.get("state") == "blocked" and e.get("blocked_reason") == "evidence_rejected", s, None, state=e.get("state"))
    # D7: changing a decided review needs processing.documents.manage AND a reason (REASON_REQUIRED otherwise).
    s, b = review(A, d, "accepted")
    check("changing a review without a reason is refused", A, s == 400 and code_of(b) == "REASON_REQUIRED", s, code_of(b))
    s, b = review(A, d, "accepted", f"{TAG} legible on resubmission")
    check("authorized re-review accepts the current version", A, s == 200 and b.get("review_status") == "accepted", s, code_of(b))
    s, b = readiness(A)
    e = state_of(b, rimm, c1) or {}
    check("accepted evidence satisfies", A, e.get("state") == "satisfied", s, None, state=e.get("state"))
    s, b = call(f"/api/admin/documents/{d}/history", A)
    acts = [str(x.get("action") or "") for x in (b or {}).get("entries") or []]
    # The D6 hosted defect (qar_af1c638fd52a, 73/74): only "Review accepted" was shown. The D7 append-only review
    # history must keep BOTH decisions, the second one naming what it replaced.
    check("history records the reviews", A, s == 200 and "Review rejected" in acts and "Review accepted (was rejected)" in acts, s, None, actions=[a for a in acts if a.startswith("Review")])

    # 7. Waivers.
    W = "/api/admin/documents/requirements/waivers"
    s, b = j(W, A, {"requirement_id": renr, "subject_type": "child", "subject_id": c2, "reason": f"{TAG} not waivable"})
    check("a non-waivable requirement is refused by the database", A, s == 409 and code_of(b) == "NOT_WAIVABLE", s, code_of(b))
    s, b = j(W, A, {"requirement_id": rimm, "subject_type": "child", "subject_id": c2, "reason": ""})
    check("a waiver needs a reason", A, s == 400 and code_of(b) == "REASON_REQUIRED", s, code_of(b))
    s, b = j(W, A, {"requirement_id": rimm, "subject_type": "household", "subject_id": hh, "reason": f"{TAG} wrong grain"})
    check("a waiver on the wrong grain is refused", A, s == 400 and code_of(b) == "WAIVER_SUBJECT_GRAIN", s, code_of(b))
    for p in ("doc_reader", "processing_only"):
        s, b = j(W, p, {"requirement_id": rimm, "subject_type": "child", "subject_id": c2, "reason": f"{TAG} unauthorized"})
        check("waiving needs processing.documents.manage", p, s == 403, s, code_of(b))
    s, b = j(W, "cross_org_admin", {"requirement_id": rimm, "subject_type": "child", "subject_id": c2, "reason": f"{TAG} foreign"})
    check("another organization cannot waive (not found)", "cross_org_admin", s == 404 and not leaks(b), s, code_of(b))
    s, b = j(W, A, {"requirement_id": rimm, "subject_type": "child", "subject_id": c2, "reason": f"{TAG} exempt"})
    wv = (b or {}).get("waiver_id") or ((b or {}).get("waiver") or {}).get("id") or (b or {}).get("id")
    waivers["imm_c2"] = wv
    save(ids)
    check("waiver granted", A, s == 200 and bool(wv), s, code_of(b))
    s, b = j(W, A, {"requirement_id": rimm, "subject_type": "child", "subject_id": c2, "reason": f"{TAG} again"})
    check("a second active waiver is refused", A, s == 409 and code_of(b) == "WAIVER_EXISTS", s, code_of(b))
    s, b = readiness(A)
    e = state_of(b, rimm, c2) or {}
    check("waived: not blocking", A, e.get("state") == "waived" and e.get("blocking") is False and e.get("waiver_id") == wv, s, None, state=e.get("state"))
    s, b, rows = work(A)
    check("waived requirement leaves the work queue", A, wid(rimm, c2) not in rows, s)
    s, b = call(f"{W}?subject_type=child&subject_id={c2}", A)
    check("waiver history lists the waiver", A, s == 200 and any(w.get("id") == wv for w in (b or {}).get("waivers") or []), s, code_of(b))
    s, b = call(f"{W}?subject_type=child&subject_id={c2}", "doc_reader")
    check("waiver history hides a medical requirement's waiver from a reader without clearance", "doc_reader",
          s == 200 and not any(w.get("id") == wv for w in (b or {}).get("waivers") or []), s, code_of(b))
    s, b = j(f"{W}/{wv}", A, {"action": "revoke", "reason": f"{TAG} no longer exempt"}, "PATCH")
    check("waiver revoked", A, s == 200 and b.get("state") == "revoked", s, code_of(b))
    s, b = j(f"{W}/{wv}", A, {"action": "revoke", "reason": f"{TAG} twice"}, "PATCH")
    check("a revoked waiver cannot be revoked again", A, s == 409 and code_of(b) == "WAIVER_NOT_ACTIVE", s, code_of(b))
    s, b, rows = work(A)
    check("after revocation the work reappears", A, (rows.get(wid(rimm, c2)) or {}).get("state") == "missing", s)

    # 8. Quarantined evidence blocks and is never listed.
    s, b, d = upload_for_child(A, c2, "immunization_record", "scripted", JS_PDF)
    scr = ((b or {}).get("screening") or {}).get("verdict") if isinstance(b, dict) else None
    if d:
        docs["held_c2"] = d
        save(ids)
    check("scripted PDF upload is quarantined", A, s in (200, 202) and bool(d) and scr in ("quarantined", "quarantine", "blocked"), s, code_of(b), screening=scr)
    s, b = readiness(A)
    e = state_of(b, rimm, c2) or {}
    ev = e.get("evidence") or {}
    check("only quarantined evidence: blocked (evidence_quarantined), id never disclosed", A,
          e.get("state") == "blocked" and e.get("blocked_reason") == "evidence_quarantined" and d not in json.dumps(ev), s, None, state=e.get("state"))
    s, b = review(A, d, "accepted")
    check("a quarantined document cannot be reviewed into evidence", A, s in (403, 404, 409, 423), s, code_of(b))

    # 9. Scope and organization isolation.
    s, b = readiness("scoped_ops")
    check("department-restricted actor: household readiness not found", "scoped_ops", s == 404 and not leaks(b), s, code_of(b))
    s, b, rows = work("scoped_ops")
    check("department-restricted actor: the run's children are not in its work", "scoped_ops", s == 200 and not any(c1 in k or c2 in k for k in rows), s, code_of(b))
    s, b = readiness("cross_org_admin")
    check("another organization: readiness not found", "cross_org_admin", s == 404 and not leaks(b), s, code_of(b))
    s, b, rows = work("cross_org_admin")
    check("another organization: none of the run's requirements in its work", "cross_org_admin",
          s == 200 and not any(renr in k or rimm in k for k in rows), s, code_of(b))
    s, b = call(f"{CFG}/{renr}", "cross_org_admin")
    check("another organization cannot read the requirement", "cross_org_admin", s == 404 and not leaks(b), s, code_of(b))
    s, b = readiness("no_docs")
    check("readiness needs documents.read", "no_docs", s == 403, s, code_of(b))

    # 10. Revision: a new published version supersedes; the old one is kept.
    s, b = j(f"{CFG}/{renr}/draft", A, draft("enrollment_document", f"{TAG} enrollment form v2", policy="optional"), "PUT")
    v2 = (b or {}).get("version_id")
    check("a published requirement revises as a new draft", A, s == 200 and v2 and v2 != v1 and (b or {}).get("version_number") == 2, s, code_of(b))
    j(f"{CFG}/{renr}/validate", A, {"version_id": v2})
    s, b = j(f"{CFG}/{renr}/publish", A, {"version_id": v2, "expected_published_version_id": v1})
    check("revision publishes over the opened version and supersedes it", A, s == 200 and (b or {}).get("superseded_version_id") == v1, s, code_of(b))
    s, b = call(f"{CFG}/{renr}", A)
    st = {v["id"]: v["status"] for v in (b or {}).get("versions") or []}
    check("history keeps the superseded version", A, st.get(v1) == "superseded" and st.get(v2) == "published", s, code_of(b), statuses=st)
    s, b = readiness(A)
    e = state_of(b, renr, c2) or {}
    check("an optional requirement never blocks", A, e.get("state") == "missing" and e.get("blocking") is False, s, None, state=e.get("state"))
    s, b, rows = work(A)
    check("an optional requirement makes no work", A, wid(renr, c2) not in rows, s)

    # 11. Archive: stops applying; cannot be waived.
    s, b = j(f"{CFG}/{rimm}", A, {"action": "archive"}, "PATCH")
    check("archive", A, s == 200 and b.get("status") == "archived", s, code_of(b))
    s, b = readiness(A)
    check("an archived requirement no longer applies", A, state_of(b, rimm, c2) is None, s)
    s, b, rows = work(A)
    check("an archived requirement makes no work", A, wid(rimm, c2) not in rows, s)
    s, b = j(W, A, {"requirement_id": rimm, "subject_type": "child", "subject_id": c2, "reason": f"{TAG} archived"})
    check("an archived requirement cannot be waived", A, s == 409 and code_of(b) in ("REQUIREMENT_NOT_LIVE", "REQUIREMENT_ARCHIVED"), s, code_of(b))
    s, b = call(f"{CFG}/{rimm}", A, "DELETE")
    check("without the run's qa_run_id an archived, waived requirement is never deleted", A, s == 409 and code_of(b) == "REQUIREMENT_IN_USE", s, code_of(b))
    s, b = call(f"{CFG}/{rimm}?qa_run_id=qar_{'0' * 12}", A, "DELETE")
    check("another run's id does not purge this run's requirement", A, s == 409 and not (b or {}).get("purged"), s, code_of(b))

    summary = {"passed": sum(1 for r in results if r["pass"]), "total": len(results)}
    json.dump({"run": RUN, "summary": summary, "results": results}, open(RESULTS_FILE, "w"), indent=2)
    print("SUMMARY", json.dumps(summary))
    sys.exit(0 if summary["passed"] == summary["total"] else 1)

# ----------------------------------------------------------------------------------------------------------------- reset
if PHASE == "reset":
    ids = load()
    A = "fixture_admin"
    out = {}
    for name, rid in (ids.get("requirements") or {}).items():
        s, b = call(f"{CFG}/{rid}", A)
        st = ((b or {}).get("requirement") or {}).get("status") if isinstance(b, dict) else None
        if s == 200 and st != "archived":
            s2, b2 = j(f"{CFG}/{rid}", A, {"action": "archive"}, "PATCH")
            print(f"archive {name}: status={s2} code={code_of(b2)}")
        s, b = call(f"{CFG}/{rid}?qa_run_id={RUN}", A, "DELETE")
        out[f"purge_{name}"] = {"status": s, "purged": (b or {}).get("purged") if isinstance(b, dict) else None,
                                "versions": (b or {}).get("versions") if isinstance(b, dict) else None,
                                "waivers": (b or {}).get("waivers") if isinstance(b, dict) else None}
        print(f"purge {name}: status={s} code={code_of(b)} {json.dumps(out[f'purge_{name}'])}")
    D = ids.get("docs") or {}
    if D.get("held_c2"):
        s, b = call(f"/api/admin/pos/documents/{D['held_c2']}", A, "DELETE")
        out["pos_delete_held"] = s
        print(f"pos delete held: status={s} code={code_of(b)}")
    if ids.get("opportunity"):
        s, b = call(f"/api/admin/opportunities/{ids['opportunity']}/delete-preview", A)
        pv = (b or {}).get("preview") or {} if isinstance(b, dict) else {}
        print(f"delete-preview: status={s} blocked={pv.get('blocked')} counts={json.dumps(pv.get('counts'))}")
        s, b = call(f"/api/admin/opportunities/{ids['opportunity']}/delete", A, "POST", b"{}", "application/json")
        out["lead_delete"] = s
        print(f"lead delete: status={s} code={code_of(b)} ok={(b or {}).get('ok') if isinstance(b, dict) else None}")
    gone = {}
    for name, rid in (ids.get("requirements") or {}).items():
        s, _ = call(f"{CFG}/{rid}", A)
        gone[f"requirement_{name}"] = s
    for key, did in D.items():
        s, _ = call(f"/api/admin/documents/{did}/signed-url", A)
        gone[f"doc_{key}"] = s
    if ids.get("household"):
        s, _ = call(f"/api/admin/documents/library?subject_type=household&subject_id={ids['household']}", A)
        gone["household_library"] = s
    out["after"] = gone
    out["all_gone"] = all(v == 404 for v in gone.values())
    print("RESET", json.dumps(out))
    json.dump(out, open(RESET_FILE, "w"), indent=2)
    sys.exit(0 if out["all_gone"] else 1)
