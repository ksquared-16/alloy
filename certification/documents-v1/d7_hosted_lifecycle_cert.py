"""Documents V1 / D7 (+ EN-FI-09) — hosted review, validity, renewal, event dates and attention certification.

Usage: d7_hosted_lifecycle_cert.py <qa_run_id> ensure|certify [B2|R3B "<reason>"]|reset

A run-scoped HOUSEHOLD FIXTURE (one adult, three children, one case), run-scoped REQUIREMENTS (`qa_<run>_…`, the D6 purge
namespace) and run-scoped event-renewal TYPES (`qa_<run>_…`), built and removed only through the deployed product's own
audited routes, as the run's fixture_admin session. Every other persona is a probe.

  ensure   create_lead → POST /api/admin/customer-members ×3 → PATCH dob on Kid One (birthday renewal).
  certify  D7.2 review lifecycle (first decision, rejection reason, re-review / reopen authority and reason, current version
           only, append-only history); D7.1 validity (derived dates, expiring soon, expired, not yet effective, refusals,
           review untouched); D7.3 renewal (reason, screening refusal, prior accepted version keeps satisfying, current
           version only, acceptance moves the date); B2 event renewal (birthday, enrollment start, program year);
           D7.4 attention (kinds, de-duplication, keyset pagination, disclosure) and the Work Items projection's source;
           EN-FI-09 the four health document types through the canonical requirement interfaces; scope, sensitivity and
           organization isolation throughout.
  reset    archive → purge requirements (qa_run_id) → lead deletion of the household (documents with it) → delete the
           run's types → verifies every id is gone.

Synthetic names/emails only (qa-d7-<run>-*@example.com); titles and file names carry qa-authz-<run>. Never prints a
cookie, signed URL, storage path or content.
"""
import calendar, datetime, json, os, sys, urllib.error, urllib.parse, urllib.request, uuid

BASE = "https://staging.workwithalloy.com"
AUTH = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.path.dirname(os.path.abspath(__file__))
RUN = sys.argv[1]
PHASE = sys.argv[2]
TAG = f"qa-authz-{RUN}"
SUFFIX = RUN.split("_", 1)[1]
KEY_PREFIX = f"qa_{SUFFIX}_"
STATE_FILE = os.path.join(HERE, f"d7_hosted_fixture_ids.{RUN}.json")
RESULTS_FILE = os.path.join(HERE, f"d7_hosted_lifecycle_cert_results.{RUN}.json")
RESET_FILE = os.path.join(HERE, f"d7_hosted_reset_results.{RUN}.json")
JS_PDF = (b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\n"
          b"trailer\n<< /Root 1 0 R >>\n%%EOF\n")
CFG = "/api/admin/documents/configuration"
REQ = f"{CFG}/requirements"
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
    return b.get("code") if isinstance(b, dict) else None


def tiny_pdf(label):
    text = f"QA authz D7 fixture {label}"
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


def email(k):
    return f"qa-d7-{SUFFIX}-{k}@example.com"


def d(s):
    return datetime.date.fromisoformat(s)


def add_months(day, n):
    y, m = divmod(day.month - 1 + n, 12)
    y, m = day.year + y, m + 1
    return datetime.date(y, m, min(day.day, calendar.monthrange(y, m)[1]))


# ---------------------------------------------------------------------------------------------------------------- ensure
if PHASE == "ensure":
    ids = load()
    if "opportunity" not in ids:
        s, b = j("/api/admin/actions/execute", A, {
            "action_key": "create_lead", "entity_type": "opportunity", "mode": "execute",
            "payload": {"first_name": "QA D7 Adult", "last_name": f"One {SUFFIX}", "email": email("a1")},
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
    s, b = call(f"/api/admin/documents/library?subject_type=opportunity&subject_id={ids['opportunity']}", A)
    lib = (b or {}).get("library") or {}
    hh = (lib.get("household") or {}).get("id")
    adults = [x["subject_id"] for x in lib.get("subjects", []) if x.get("role") == "adult"]
    print(f"library(case): status={s} household={bool(hh)} adults={len(adults)}")
    if not hh or not adults:
        sys.exit(1)
    ids["household"] = hh
    ids.setdefault("adult1", adults[0])
    save(ids)
    for k, first in (("child1", "Kid One"), ("child2", "Kid Two"), ("child3", "Kid Three")):
        if k in ids:
            continue
        s, b = j("/api/admin/customer-members", A, {
            "customer_id": hh, "display_name": f"QA D7 {first} {SUFFIX}", "relationship": "child",
            "first_name": f"QA D7 {first}", "last_name": SUFFIX,
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
    # Kid One's birthday falls 20 days after today (UTC; the org date is measured in certify), born 2021.
    if "child1_dob" not in ids:
        t = datetime.date.today() + datetime.timedelta(days=20)
        dob = datetime.date(2021, t.month, min(t.day, 28 if t.month == 2 else t.day)).isoformat()
        req = urllib.request.Request(BASE + f"/api/admin/customer-members/{ids['child1']}", method="PATCH",
                                     headers={"accept": "application/json", "content-type": "application/json", "cookie": cookie(A),
                                              "origin": BASE, "referer": BASE + "/admin", "prefer": "return=minimal"},
                                     data=json.dumps({"dob": dob}).encode())
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                s = r.status
        except urllib.error.HTTPError as e:
            s = e.code
        print(f"dob child1: status={s}")
        if s != 200:
            sys.exit(1)
        ids["child1_dob"] = dob
        save(ids)
    print("ENSURE", json.dumps({k: bool(v) for k, v in ids.items()}))
    sys.exit(0)

# --------------------------------------------------------------------------------------------------------------- certify
results = []


def check(section, case, persona, ok, status, code=None, **extra):
    results.append({"section": section, "case": case, "persona": persona, "pass": bool(ok), "status": status, "code": code, **extra})
    print(("PASS " if ok else "FAIL ") + f"[{section}][{persona}] {case} :: status={status} code={code}" + (f" {json.dumps(extra)}" if extra else ""))


ONLY = sys.argv[3] if len(sys.argv) > 3 else None
RAN = {"B2": {"D7.B2-event-dates"}, "R3B": {"D7.3b-rejected-renewal"}, "R1": {"R1-rejected-renewal"},
       "R1B": {"R1B-subsequent-acceptance"}}.get(ONLY, set())
REASON = sys.argv[4] if len(sys.argv) > 4 else None

if PHASE == "certify":
    ids = load()
    hh, c1, c2, c3 = ids["household"], ids["child1"], ids["child2"], ids["child3"]
    reqs = ids.setdefault("requirements", {})
    docs = ids.setdefault("docs", {})
    types = ids.setdefault("types", {})
    SECRETS = [TAG, SUFFIX, "QA D7"]

    def leaks(b):
        raw = json.dumps(b)
        return [x for x in SECRETS if x in raw]

    def upload(persona, child_id, doc_type, stem, content=None):
        body, ct = multipart({"entity_type": "customer_member", "entity_id": child_id, "doc_type": doc_type, "title": f"{TAG} {stem}"},
                             f"{TAG}-{stem}.pdf", content or tiny_pdf(stem), "application/pdf")
        s, b = call("/api/admin/documents/upload", persona, "POST", body, ct)
        dd = (b or {}).get("document") if isinstance(b, dict) else None
        did = dd.get("id") if isinstance(dd, dict) else None
        if did:
            docs[stem] = did
            save(ids)
        return s, b, did

    def renew(persona, doc, stem, reason, content=None, **dates):
        fields = {"reason": reason, **{k: v for k, v in dates.items() if v is not None}}
        body, ct = multipart(fields, f"{TAG}-{stem}.pdf", content or tiny_pdf(stem), "application/pdf")
        return call(f"/api/admin/documents/{doc}/versions", persona, "POST", body, ct)

    def draft(type_key, label, subject="child", policy="required", waivable=False, **over):
        x = {"label": label, "document_type_key": type_key, "subject_type": subject, "scope": {"kind": "all"},
             "timing": {"kind": "immediate"}, "policy": policy, "waivable": waivable, "effective_from": None, "effective_until": None}
        x.update(over)
        return x

    def publish_requirement(name, body):
        s, b = j(REQ, A, {**body, "key": KEY_PREFIX + name})
        rid, vid = (b or {}).get("requirement_id"), (b or {}).get("version_id")
        if rid:
            reqs[name] = rid
            save(ids)
        s2, b2 = j(f"{REQ}/{rid}/validate", A, {"version_id": vid})
        s3, b3 = j(f"{REQ}/{rid}/publish", A, {"version_id": vid, "expected_published_version_id": None})
        return rid, s3, b3, (b2 or {}).get("problems")

    def readiness(p, anchor=None):
        t, i = anchor or ("household", hh)
        return call(f"/api/admin/documents/requirements/readiness?subject_type={t}&subject_id={i}", p)

    def state_of(b, rid, sid):
        for s in (((b or {}).get("readiness") or {}).get("subjects") or []):
            if s["subject"]["subject_id"] != sid:
                continue
            for e in s.get("requirements") or []:
                if e["requirement_id"] == rid:
                    return e
        return None

    def work(p, q=""):
        s, b = call("/api/admin/documents/requirements/work" + q, p)
        return s, (b if isinstance(b, dict) else {})

    def work_rows(b, rid, sid):
        return [r for r in (b.get("rows") or []) if r.get("requirement_id") == rid and r.get("subject_id") == sid]

    def attention_all(p, limit=500):
        """Follow the keyset cursor to the end; returns (pages, rows, complete, statuses)."""
        pages, rows, cur, statuses = 0, [], None, []
        while True:
            q = f"?documents_limit={limit}" + (f"&documents_cursor={urllib.parse.quote(cur)}" if cur else "")
            s, b = work(p, q)
            statuses.append(s)
            pages += 1
            rows += b.get("documents") or []
            cur = b.get("documents_next_cursor")
            if s != 200 or b.get("documents_complete") or not cur or pages > 400:
                return pages, rows, bool(b.get("documents_complete")), statuses

    def review(p, doc, decision, reason=None, version_id=None):
        body = {"decision": decision}
        if reason is not None:
            body["reason"] = reason
        if version_id:
            body["version_id"] = version_id
        return j(f"/api/admin/documents/{doc}/review", p, body)

    def validity(p, doc, method="GET", **body):
        if method == "GET":
            return call(f"/api/admin/documents/{doc}/validity", p)
        return j(f"/api/admin/documents/{doc}/validity", p, body, "PUT")

    def history(doc):
        s, b = call(f"/api/admin/documents/{doc}/history", A)
        return s, [str(x.get("action") or "") for x in (b or {}).get("entries") or []] if isinstance(b, dict) else []

    def versions(p, doc):
        s, b = call(f"/api/admin/documents/{doc}/versions", p)
        return s, ((b or {}).get("versions") or []) if isinstance(b, dict) else []


    s, b = work(A)
    TODAY = d(b.get("today")) if b.get("today") else datetime.date.today()
    iso = lambda x: x.isoformat()  # noqa: E731
    print(f"organization date {TODAY}")

    if ONLY is None:
        # 0. Clean start: no live child requirement on the run's types outside this run.
        s, b = call(REQ, A)
        live = [r for r in ((b or {}).get("requirements") or []) if r.get("status") == "active" and r.get("published")]
        used = ("immunization_record", "physical", "health_care_plan", "medication_authorization")
        clash = [r["key"] for r in live if (r["published"] or {}).get("document_type_key") in used
                 and (r["published"] or {}).get("subject_type") == "child" and not r["key"].startswith(KEY_PREFIX)]
        check("setup", "no pre-existing live child requirement for the run's types", A, s == 200 and not clash, s, code_of(b), clash=clash)

        # ═══════════════════════════════════════════════════════════════════════════════ D7.2 review lifecycle
        S = "D7.2-review"
        rimm, s, b, probs = publish_requirement("imm", draft("immunization_record", f"{TAG} immunization (D7)"))
        check(S, "immunization requirement published", A, s == 200, s, code_of(b), problems=probs)
        s, b, dimm = upload(A, c1, "immunization_record", "imm-c1")
        check(S, "immunization record uploaded for Kid One", A, s == 200 and bool(dimm), s, code_of(b))
        s, b = readiness(A)
        e = state_of(b, rimm, c1) or {}
        check(S, "review required → pending review (not satisfied)", A, e.get("state") == "pending_review" and dimm in (e.get("evidence") or {}).get("pending", []), s, None, state=e.get("state"))
        s, b = review(A, dimm, "rejected")
        check(S, "a rejection without a reason is refused", A, s == 400 and code_of(b) == "REASON_REQUIRED", s, code_of(b))
        for p in ("doc_reader", "ocr", "scoped_ops", "no_docs", "processing_only"):
            s, b = review(p, dimm, "accepted")
            check(S, "reviewing needs documents.write and the document's clearance", p, s in (403, 404) and not leaks(b), s, code_of(b))
        s, b = review("cross_org_admin", dimm, "accepted")
        check(S, "another organization: review not found", "cross_org_admin", s == 404 and not leaks(b), s, code_of(b))
        s, b = review(A, dimm, "rejected", f"{TAG} illegible scan")
        check(S, "first decision: rejected with a reason", A, s == 200 and (b or {}).get("review_status") == "rejected", s, code_of(b))
        s, b = readiness(A)
        e = state_of(b, rimm, c1) or {}
        check(S, "rejected evidence does not satisfy", A, e.get("state") in ("blocked", "missing") and e.get("blocking") is True
              and dimm in (e.get("evidence") or {}).get("rejected", []), s, None, state=e.get("state"), blocked_reason=e.get("blocked_reason"))
        s, b = review(A, dimm, "accepted")
        check(S, "changing a decided review without a reason is refused", A, s == 400 and code_of(b) == "REASON_REQUIRED", s, code_of(b))
        s, b = review(A, dimm, "accepted", f"{TAG} legible on second look")
        check(S, "re-review (rejected → accepted) with reason by Documents administration", A, s == 200 and (b or {}).get("review_status") == "accepted", s, code_of(b))
        s, b = readiness(A)
        check(S, "accepted evidence satisfies", A, (state_of(b, rimm, c1) or {}).get("state") == "satisfied", s)
        s, b = review(A, dimm, "pending")
        check(S, "reopening without a reason is refused", A, s == 400 and code_of(b) == "REASON_REQUIRED", s, code_of(b))
        s, b = review(A, dimm, "pending", f"{TAG} reopen for second reviewer")
        check(S, "reopen (accepted → pending) with reason", A, s == 200 and (b or {}).get("review_status") == "pending", s, code_of(b))
        s, b = readiness(A)
        check(S, "reopened evidence is pending review again", A, (state_of(b, rimm, c1) or {}).get("state") == "pending_review", s)
        s, b = review(A, dimm, "accepted", f"{TAG} accepted by second reviewer")
        check(S, "accepted again after reopen", A, s == 200 and (b or {}).get("review_status") == "accepted", s, code_of(b))
        s, acts = history(dimm)
        revs = [a for a in acts if a.startswith("Review")]
        check(S, "append-only history keeps every decision with what it replaced", A,
              s == 200 and "Review rejected" in acts and "Review accepted (was rejected)" in acts and len(revs) >= 4, s, None, review_entries=revs)
        s, b = call(f"/api/admin/documents/{dimm}/history", "cross_org_admin")
        check(S, "another organization: history not found", "cross_org_admin", s == 404 and not leaks(b), s, code_of(b))
        s, b = call(f"/api/admin/documents/{dimm}/history", "doc_reader")
        check(S, "reader without health.view: a medical document's history is not disclosed", "doc_reader", s in (403, 404) and not leaks(b), s, code_of(b))

        # ═══════════════════════════════════════════════════════════════════════════════ D7.1 validity
        S = "D7.1-validity"
        s, b = validity(A, dimm)
        v = (b or {}).get("validity") or {}
        exp_derived = add_months(TODAY, 12) - datetime.timedelta(days=1)
        check(S, "periodic reconfirmation (12 months): derived from the review date, valid", A,
              s == 200 and ((b or {}).get("policy") or {}).get("kind") == "periodic_reconfirmation" and v.get("status") == "valid"
              and v.get("expires_source") == "derived" and v.get("expires_on") == iso(exp_derived), s, code_of(b),
              status_=v.get("status"), expires_on=v.get("expires_on"), expected=iso(exp_derived))
        s, b = readiness(A)
        e = state_of(b, rimm, c1) or {}
        check(S, "readiness reports valid-through from the same evaluator", A, e.get("state") == "satisfied" and e.get("valid_until") == iso(exp_derived)
              and e.get("expiring_soon") is False, s, None, valid_until=e.get("valid_until"))
        for p in ("doc_reader", "ocr"):
            s, b = validity(p, dimm, "PUT", effective_on=None, expires_on=iso(TODAY + datetime.timedelta(days=5)), reason=f"{TAG} unauthorized")
            check(S, "recording dates needs documents.write and clearance", p, s in (403, 404) and not leaks(b), s, code_of(b))
        s, b = validity("cross_org_admin", dimm)
        check(S, "another organization: validity not found", "cross_org_admin", s == 404 and not leaks(b), s, code_of(b))
        s, b = validity(A, dimm, "PUT", effective_on=iso(TODAY + datetime.timedelta(days=10)), expires_on=iso(TODAY), reason=f"{TAG} inverted")
        check(S, "an inverted range is refused", A, s == 400 and code_of(b) == "VALIDITY_RANGE_INVERTED", s, code_of(b))
        s, b = validity(A, dimm, "PUT", effective_on=None, expires_on="2026-13-45", reason=f"{TAG} bad")
        check(S, "an impossible date is refused", A, s == 400 and code_of(b) == "BAD_DATE", s, code_of(b))
        soon = TODAY + datetime.timedelta(days=5)
        s, b = validity(A, dimm, "PUT", effective_on=None, expires_on=iso(soon), reason=f"{TAG} certificate expires soon")
        v = (b or {}).get("validity") or {}
        check(S, "a recorded expiration inside the warning window: expiring soon", A, s == 200 and v.get("status") == "expiring_soon"
              and v.get("expires_source") == "recorded" and v.get("days_remaining") == 5, s, code_of(b), validity=v)
        s, b = readiness(A)
        e = state_of(b, rimm, c1) or {}
        check(S, "readiness: still satisfied, expiring soon, valid through the recorded day", A,
              e.get("state") == "satisfied" and e.get("expiring_soon") is True and e.get("valid_until") == iso(soon) and e.get("blocking") is False, s, None,
              state=e.get("state"), valid_until=e.get("valid_until"))
        s, b = work(A)
        wr = work_rows(b, rimm, c1)
        check(S, "work: an expiring-soon renewal row due on the last valid day, never overdue, never blocking", A,
              s == 200 and any(r.get("state") == "expiring_soon" and r.get("due_on") == iso(soon) and r.get("overdue") is False for r in wr), s, None,
              rows=[{k: r.get(k) for k in ("state", "due_on", "overdue", "valid_until")} for r in wr])
        check(S, "attention de-duplication: a document a requirement row names is not repeated", A,
              not any(x.get("document_id") == dimm for x in b.get("documents") or []), s)
        s, vs = versions(A, dimm)
        cur = vs[0] if vs else {}
        check(S, "recording dates leaves the review untouched", A, s == 200 and any(x.get("review_status") == "accepted" for x in vs), s, None,
              review_statuses=[x.get("review_status") for x in vs])
        s, acts = history(dimm)
        check(S, "the date change is in the append-only history", A, s == 200 and len([a for a in acts if a.startswith("Review")]) >= 4 and len(acts) > len(revs), s, None, actions=acts[:12])
        past = TODAY - datetime.timedelta(days=1)
        s, b = validity(A, dimm, "PUT", effective_on=None, expires_on=iso(past), reason=f"{TAG} certificate lapsed")
        check(S, "a recorded past expiration: expired", A, s == 200 and ((b or {}).get("validity") or {}).get("status") == "expired", s, code_of(b))
        s, b = readiness(A)
        e = state_of(b, rimm, c1) or {}
        check(S, "readiness: expired evidence no longer satisfies; blocking", A, e.get("state") == "expired" and e.get("blocking") is True
              and dimm in (e.get("evidence") or {}).get("expired", []), s, None, state=e.get("state"))
        s, b = work(A)
        wr = work_rows(b, rimm, c1)
        check(S, "work: an expired row naming the document", A, any(r.get("state") == "expired" and dimm in (r.get("expired_document_ids") or []) for r in wr), s, None,
              rows=[r.get("state") for r in wr])
        s, b = validity(A, dimm, "PUT", effective_on=iso(TODAY + datetime.timedelta(days=3)), expires_on=iso(TODAY + datetime.timedelta(days=400)), reason=f"{TAG} effective later")
        check(S, "a future effective date: not yet effective", A, s == 200 and ((b or {}).get("validity") or {}).get("status") == "not_yet_effective", s, code_of(b))
        s, b = readiness(A)
        e = state_of(b, rimm, c1) or {}
        check(S, "readiness: a not-yet-effective document does not satisfy", A, e.get("state") not in ("satisfied", None), s, None, state=e.get("state"))
        s, b = validity(A, dimm, "PUT", effective_on=None, expires_on=iso(soon), reason=f"{TAG} back to expiring soon")
        check(S, "dates restored to expiring soon (renewal setup)", A, s == 200 and ((b or {}).get("validity") or {}).get("status") == "expiring_soon", s, code_of(b))

        # ═══════════════════════════════════════════════════════════════════════════════ D7.3 renewal / replacement
        S = "D7.3-renewal"
        s, vs = versions(A, dimm)
        v1 = (vs[0] if vs else {}).get("id")
        n0 = len(vs)
        s, b = renew(A, dimm, "imm-c1-v2-short", "short")
        check(S, "a renewal needs a reason (≥10 characters)", A, s == 400 and code_of(b) == "REASON_REQUIRED", s, code_of(b))
        s, b = renew(A, dimm, "imm-c1-scripted", f"{TAG} scripted replacement", JS_PDF)
        s2, vs = versions(A, dimm)
        check(S, "a replacement screening would quarantine is refused before storage", A, s in (400, 409, 415, 422) and len(vs) == n0, s, code_of(b), versions=len(vs))
        s, b = renew("doc_reader", dimm, "imm-c1-unauth", f"{TAG} unauthorized renewal")
        check(S, "renewal needs documents.write and clearance", "doc_reader", s in (403, 404) and not leaks(b), s, code_of(b))
        s, b = renew("cross_org_admin", dimm, "imm-c1-x", f"{TAG} cross-organization renewal")
        check(S, "another organization: renewal not found", "cross_org_admin", s == 404 and not leaks(b), s, code_of(b))
        new_exp = TODAY + datetime.timedelta(days=365)
        s, b = renew(A, dimm, "imm-c1-v2", f"{TAG} renewed certificate", effective_on=iso(TODAY), expires_on=iso(new_exp))
        v2 = (b or {}).get("version_id")
        check(S, "renewal stores a replacement version of the same document", A,
              s == 200 and v2 and (b or {}).get("supersedes_version_id") == v1 and (b or {}).get("version_number") == n0 + 1, s, code_of(b),
              version_number=(b or {}).get("version_number"), validity_recorded=(b or {}).get("validity_recorded"))
        s, b = readiness(A)
        e = state_of(b, rimm, c1) or {}
        check(S, "the earlier accepted, in-force version keeps satisfying while the renewal awaits review", A,
              e.get("state") == "satisfied" and e.get("renewal_pending") is True and e.get("valid_until") == iso(soon), s, None,
              state=e.get("state"), renewal_pending=e.get("renewal_pending"), valid_until=e.get("valid_until"))
        s, b = review(A, dimm, "accepted", f"{TAG} old version", version_id=v1)
        check(S, "only the current version is reviewed", A, s == 409 and code_of(b) == "NOT_CURRENT_VERSION", s, code_of(b))
        s, b = review(A, dimm, "accepted", version_id=v2)
        check(S, "the renewal's first decision: accepted", A, s == 200 and (b or {}).get("review_status") == "accepted", s, code_of(b))
        s, b = readiness(A)
        e = state_of(b, rimm, c1) or {}
        check(S, "accepted renewal moves valid-through to the new date; no renewal pending", A,
              e.get("state") == "satisfied" and e.get("valid_until") == iso(new_exp) and not e.get("renewal_pending") and e.get("expiring_soon") is False, s, None,
              valid_until=e.get("valid_until"))
        s, vs = versions(A, dimm)
        check(S, "earlier versions are kept", A, s == 200 and len(vs) == n0 + 1 and v1 in [x.get("id") for x in vs], s, None, versions=len(vs))
        s, b = work(A)
        check(S, "work: the renewal row is gone once the renewal is accepted", A, not work_rows(b, rimm, c1), s)
        s, b = renew(A, dimm, "imm-c1-v3", f"{TAG} second renewal to reject", effective_on=iso(TODAY), expires_on=iso(TODAY + datetime.timedelta(days=500)))
        v3 = (b or {}).get("version_id")
        s, b = review(A, dimm, "rejected", f"{TAG} renewal rejected", version_id=v3)
        check(S, "a renewal can be rejected with a reason", A, s == 200 and (b or {}).get("review_status") == "rejected", s, code_of(b))
        s, b = readiness(A)
        e = state_of(b, rimm, c1) or {}
        check(S, "a rejected renewal does not unseat the accepted, in-force version", A, e.get("state") == "satisfied" and e.get("valid_until") == iso(new_exp), s, None, state=e.get("state"))

    if ONLY in (None, "R3B"):
        # Added after the browser walk showed "renewal awaiting review" beside a REJECTED renewal: the D7.3 section
        # asserted state and valid-through after the rejection but never renewal_pending.
        S = "D7.3b-rejected-renewal"
        rimm, dimm = reqs["imm"], docs["imm-c1"]
        s, vs = versions(A, dimm)
        cur = next((x for x in vs if x.get("is_current") or x.get("current")), vs[0] if vs else {})
        s, b = readiness(A)
        e = state_of(b, rimm, c1) or {}
        check(S, "the current version is the rejected renewal", A, any(x.get("review_status") == "rejected" for x in vs[:1]) or cur.get("review_status") == "rejected", s, None,
              current_review_status=cur.get("review_status"))
        check(S, "a REJECTED renewal is not reported as 'renewal awaiting review' (renewal_pending)", A, e.get("state") == "satisfied" and e.get("renewal_pending") is False, s, None,
              state=e.get("state"), renewal_pending=e.get("renewal_pending"), valid_until=e.get("valid_until"))

    if ONLY in (None, "B2"):
        # ═══════════════════════════════════════════════════════════════════════════════ B2 event-relative validity
        S = "D7.B2-event-dates"
        s, b = call(f"{CFG}/types", A)
        all_types = (b or {}).get("types") or []
        # The type list carries the category on the published version (`published.category_id`).
        health_cat = next(((t.get("published") or {}).get("category_id") for t in all_types if t.get("key") == "immunization_record"), None)
        for ev in ("birthday", "enrollment_start", "program_year_start"):
            key = f"{KEY_PREFIX}ev_{ev}"[:60]
            body = {"label": f"QA D7 event {ev}", "description": "D7 hosted certification fixture",
                    "category_id": health_cat, "subject_types": ["child"], "allowed_formats": ["pdf"],
                    "default_sensitivity": "standard", "review_required": False, "replacement_policy": "new_version",
                    "validity_policy": {"kind": "event_renewal", "event": ev, "warning_days": [30]}}
            if ev not in types:
                s, b = j(f"{CFG}/types", A, {**body, "key": key})
                tid, tv = (b or {}).get("type_id"), (b or {}).get("version_id")
                if tid:
                    types[ev] = {"id": tid, "key": key}
                    save(ids)
            else:
                # A draft left unpublished by an earlier attempt is repaired through the same Studio draft route.
                tid = types[ev]["id"]
                s, b = call(f"{CFG}/types/{tid}", A)
                if ((b or {}).get("type") or {}).get("published_version_id"):
                    continue
                s, b = j(f"{CFG}/types/{tid}/draft", A, body, "PUT")
                tv = (b or {}).get("version_id")
            s, b = j(f"{CFG}/types/{tid}/validate", A, {"version_id": tv})
            check(S, f"event-renewal type ({ev}) validates", A, s == 200 and (b or {}).get("valid") is True, s, code_of(b), problems=(b or {}).get("problems"))
            s, b = j(f"{CFG}/types/{tid}/publish", A, {"version_id": tv, "expected_published_version_id": None})
            check(S, f"event-renewal type ({ev}) authored and published through Studio", A, s == 200, s, code_of(b))
        dob = d(ids["child1_dob"])
        s, b, dbd = upload(A, c1, types["birthday"]["key"], "bday-c1")
        s, b = validity(A, dbd)
        v = (b or {}).get("validity") or {}
        nb = datetime.date(TODAY.year, dob.month, dob.day)
        if nb <= TODAY:
            nb = datetime.date(TODAY.year + 1, dob.month, dob.day)
        want = nb - datetime.timedelta(days=1)
        check(S, "birthday renewal: expires the day before the first birthday after the anchor", A,
              s == 200 and v.get("expires_source") == "derived" and v.get("expires_on") == iso(want), s, code_of(b),
              expires_on=v.get("expires_on"), expected=iso(want), status_=v.get("status"))
        check(S, "birthday renewal inside the warning window is expiring soon", A, v.get("status") == "expiring_soon", s, None, status_=v.get("status"))
        s, b, dbd2 = upload(A, c2, types["birthday"]["key"], "bday-c2")
        s, b = validity(A, dbd2)
        v = (b or {}).get("validity") or {}
        check(S, "birthday renewal without a recorded birth date: date missing, never guessed", A,
              v.get("status") == "date_missing" and v.get("event_unavailable") == "birthday_not_recorded" and not v.get("expires_on"), s, code_of(b), validity=v)
        s, b, den = upload(A, c1, types["enrollment_start"]["key"], "enr-c1")
        s, b = validity(A, den)
        v = (b or {}).get("validity") or {}
        check(S, "enrollment-start renewal with no enrollment on record: date missing with its reason", A,
              v.get("status") == "date_missing" and v.get("event_unavailable") == "no_enrollment", s, code_of(b), validity=v)
        s, b, dpy = upload(A, c1, types["program_year_start"]["key"], "py-c1")
        s, b = validity(A, dpy)
        v = (b or {}).get("validity") or {}
        check(S, "program-year renewal: explicitly unresolved (event_source_unavailable), never guessed", A,
              v.get("status") == "date_missing" and v.get("event_unavailable") == "event_source_unavailable", s, code_of(b), validity=v)
        s, b = work(A, "?documents_limit=500")
        att = {x.get("document_id"): x for x in b.get("documents") or []}
        check(S, "unresolved event dates surface as date-missing attention", A,
              (att.get(dpy) or {}).get("kind") == "date_missing" and (att.get(dbd2) or {}).get("kind") == "date_missing", s, None,
              kinds={k: (att.get(x) or {}).get("kind") for k, x in (("py", dpy), ("bday_no_dob", dbd2), ("bday", dbd))})
        check(S, "a birthday renewal inside its window is expiring-soon attention", A, (att.get(dbd) or {}).get("kind") == "expiring_soon"
              and (att.get(dbd) or {}).get("expires_on") == iso(want), s, None)
        py_exp = TODAY + datetime.timedelta(days=200)
        s, b = validity(A, dpy, "PUT", effective_on=None, expires_on=iso(py_exp), reason=f"{TAG} program year end recorded")
        v = (b or {}).get("validity") or {}
        check(S, "a recorded date resolves an unresolved program year", A, s == 200 and v.get("status") == "valid" and v.get("expires_on") == iso(py_exp)
              and v.get("expires_source") == "recorded", s, code_of(b), validity=v)
        s, b = work(A, "?documents_limit=500")
        check(S, "recording the date removes the attention row", A, not any(x.get("document_id") == dpy for x in b.get("documents") or []), s)

    if ONLY is None:
        # ═══════════════════════════════════════════════════════════════════════════════ D7.4 attention, pagination, projections
        S = "D7.4-attention"
        s, b, dsub = upload(A, c2, "subsidy_authorization", "subsidy-c2")
        s, b = review(A, dsub, "accepted")
        s, b, dsub2 = upload(A, c3, "subsidy_authorization", "subsidy-c3-pending")
        s, b = work(A, "?documents_limit=500")
        att = {x.get("document_id"): x for x in b.get("documents") or []}
        check(S, "explicit-date type accepted without a date: date missing", A, (att.get(dsub) or {}).get("kind") == "date_missing", s, None, kind=(att.get(dsub) or {}).get("kind"))
        check(S, "a review-required document awaiting review: review due", A, (att.get(dsub2) or {}).get("kind") == "review_due", s, None, kind=(att.get(dsub2) or {}).get("kind"))
        row = att.get(dsub) or {}
        check(S, "attention rows carry what the Work Items projection maps (type, subject, kind, due)", A,
              all(k in row for k in ("document_type_label", "subject_label", "subject_type", "subject_id", "kind", "due_on", "household_id")) and row.get("subject_id") == c2, s, None)
        one_shot = b.get("documents") or []
        complete_one = bool(b.get("documents_complete"))
        pages, rows, complete, sts = attention_all(A, limit=1)
        ids_paged = [x.get("document_id") for x in rows]
        check(S, "keyset pagination (1 row per page) reaches documents_complete with no duplicate and nothing lost", A,
              complete and all(x == 200 for x in sts) and len(ids_paged) == len(set(ids_paged))
              and (not complete_one or set(ids_paged) == {x.get("document_id") for x in one_shot}), sts[-1], None,
              pages=pages, rows=len(ids_paged), single_request_rows=len(one_shot), single_request_complete=complete_one)
        pages3, rows3, complete3, sts3 = attention_all(A, limit=3)
        check(S, "pagination is stable across page sizes", A, complete3 and [x.get("document_id") for x in rows3] == ids_paged, sts3[-1], None, pages=pages3)
        s, b = work(A, "?documents_cursor=not-a-cursor")
        check(S, "a forged cursor is refused", A, s == 400 and code_of(b) == "INVALID_CURSOR", s, code_of(b))
        s, b = work(A, "?documents_limit=100000")
        check(S, "a page never exceeds 500 rows", A, s in (200, 400) and len((b or {}).get("documents") or []) <= 500, s, code_of(b))
        check(S, "organization attention population measured (scale context for the removed 1,000 cap)", A, True, 200, None,
              org_attention_documents=len(ids_paged), beyond_1000_exercised=len(ids_paged) > 1000)
        s, b = work("doc_reader", "?documents_limit=500")
        dr = [x.get("document_id") for x in (b.get("documents") or [])]
        dr_rows = [r for r in (b.get("rows") or []) if r.get("requirement_id") == rimm]
        check(S, "reader without health.view: no medical attention row or requirement row", "doc_reader",
              s == 200 and dimm not in dr and not dr_rows, s, None)
        check(S, "reader without health.view: standard-sensitivity attention still disclosed", "doc_reader", dsub in dr, s)
        s, b = work("scoped_ops", "?documents_limit=500")
        so = json.dumps(b)
        check(S, "department-restricted actor: none of the run's household in work or attention", "scoped_ops",
              s == 200 and not any(x in so for x in (c1, c2, c3, hh)), s, code_of(b))
        s, b = work("cross_org_admin", "?documents_limit=500")
        xo = json.dumps(b)
        check(S, "another organization: none of the run's work or attention", "cross_org_admin", s == 200 and not any(x in xo for x in (c1, c2, c3, hh, rimm)), s, code_of(b))
        for p in ("no_docs", "processing_only"):
            s, b = work(p)
            check(S, "work needs documents.read", p, s == 403, s, code_of(b))

        # ═══════════════════════════════════════════════════════════════════════════════ EN-FI-09 health document types
        S = "EN-FI-09"
        for t, name in (("physical", "phy"), ("health_care_plan", "hcp"), ("medication_authorization", "med")):
            rid, s, b, probs = publish_requirement(name, draft(t, f"{TAG} {t} (FI-09)"))
            check(S, f"{t}: child requirement published through the canonical requirement interface", A, s == 200, s, code_of(b), problems=probs)
            s, b = j(REQ, A, {**draft(t, f"{TAG} {t} household"), "subject_type": "household", "key": f"{KEY_PREFIX}{name}_hh"})
            hid, hv = (b or {}).get("requirement_id"), (b or {}).get("version_id")
            s, b = j(f"{REQ}/{hid}/validate", A, {"version_id": hv})
            codes = sorted(p.get("code") for p in ((b or {}).get("problems") or []))
            check(S, f"{t}: a household requirement is refused by database validation", A, s == 200 and (b or {}).get("valid") is False
                  and "subject_type_not_accepted_by_type" in codes, s, code_of(b), problems=codes)
            call(f"{REQ}/{hid}", A, "DELETE")
        for t, name in (("physical", "phy"), ("health_care_plan", "hcp"), ("medication_authorization", "med"), ("immunization_record", "imm")):
            rid = reqs[name]
            s, b = readiness(A)
            e = state_of(b, rid, c3) or {}
            check(S, f"{t}: missing for Kid Three", A, e.get("state") == "missing" and e.get("blocking") is True, s, None, state=e.get("state"))
            s, b = readiness("doc_reader")
            check(S, f"{t}: medical requirement invisible to a reader without health.view", "doc_reader", s == 200 and state_of(b, rid, c3) is None, s)
            s, b, dd = upload(A, c3, t, f"fi09-{name}-c3")
            s, b = readiness(A)
            e = state_of(b, rid, c3) or {}
            check(S, f"{t}: an uploaded document is pending review, never satisfied by upload", A, e.get("state") == "pending_review", s, None, state=e.get("state"))
            s, b = review(A, dd, "accepted")
            s, b = readiness(A)
            e = state_of(b, rid, c3) or {}
            want = add_months(TODAY, 12) - datetime.timedelta(days=1)
            check(S, f"{t}: accepted → satisfied with the seeded 12-month validity", A, e.get("state") == "satisfied" and e.get("valid_until") == iso(want), s, None,
                  state=e.get("state"), valid_until=e.get("valid_until"), expected=iso(want))
            s, b = validity(A, dd, "PUT", effective_on=None, expires_on=iso(TODAY - datetime.timedelta(days=1)), reason=f"{TAG} lapsed (FI-09)")
            s, b = readiness(A)
            e = state_of(b, rid, c3) or {}
            check(S, f"{t}: lapsed → expired and blocking", A, e.get("state") == "expired" and e.get("blocking") is True, s, None, state=e.get("state"))
            s, b = call(f"/api/admin/documents/{dd}/signed-url", "doc_reader")
            check(S, f"{t}: the medical document itself is refused to a reader without health.view", "doc_reader", s in (403, 404) and not leaks(b), s, code_of(b))

    # ═══════════════════════════════════════════════════════════════════════════════ R1 fix-forward (PR #1612)
    # A rejected renewal of EXPIRING evidence: the case D7.3b could not reach (its in-force version was a year out, so no
    # work row existed). Kid Two and Kid Three each get an accepted v1 expiring soon and a rejected v2 renewal. Kid Two is
    # then re-reviewed by an authorized reviewer; Kid Three is left rejected for the browser walk, and R1B accepts new
    # evidence (v3) for it afterwards. Work Items' verb is the deployed mapper's rule applied to the hosted row.
    def wi_verb(r):
        st, rn = r.get("state"), r.get("renewal")
        return ("Review" if st == "pending_review" or rn == "pending" else "Resolve" if st == "blocked"
                else "Renew" if st in ("expired", "expiring_soon") else "Collect")

    def processing_action(r):
        st, rn = r.get("state"), r.get("renewal")
        return ("Review on the record" if st == "pending_review" or rn == "pending" else
                "Renew on the record" if st in ("expired", "expiring_soon") else "Open the record's documents")

    if ONLY == "R1":
        S = "R1-rejected-renewal"
        rimm = reqs["imm"]
        r1_soon = TODAY + datetime.timedelta(days=5)
        r1_new = TODAY + datetime.timedelta(days=365)
        r1 = ids.setdefault("r1", {})
        for ck, cid in (("c2", c2), ("c3", c3)):
            s, b, dd = upload(A, cid, "immunization_record", f"r1-imm-{ck}")
            check(S, f"{ck}: immunization v1 uploaded", A, s == 200 and bool(dd), s, code_of(b))
            s, b = validity(A, dd, "PUT", effective_on=iso(TODAY - datetime.timedelta(days=300)), expires_on=iso(r1_soon), reason=f"{TAG} r1 v1 dates")
            check(S, f"{ck}: v1 dated to expire inside the warning window", A, s == 200 and ((b or {}).get("validity") or {}).get("status") == "expiring_soon", s, code_of(b))
            s, b = review(A, dd, "accepted")
            check(S, f"{ck}: v1 accepted", A, s == 200 and (b or {}).get("review_status") == "accepted", s, code_of(b))
            s, vs = versions(A, dd)
            v1 = (vs[0] if vs else {}).get("id")
            s, b = renew(A, dd, f"r1-imm-{ck}-v2", f"{TAG} r1 renewal to reject", effective_on=iso(TODAY), expires_on=iso(r1_new))
            v2 = (b or {}).get("version_id")
            check(S, f"{ck}: renewal v2 stored", A, s == 200 and bool(v2), s, code_of(b))
            s, b = readiness(A)
            e = state_of(b, rimm, cid) or {}
            check(S, f"{ck}: while v2 awaits review: satisfied, renewal_pending, not rejected", A,
                  e.get("state") == "satisfied" and e.get("renewal_pending") is True and e.get("renewal_rejected") is False and e.get("valid_until") == iso(r1_soon), s, None,
                  state=e.get("state"), renewal_pending=e.get("renewal_pending"), renewal_rejected=e.get("renewal_rejected"))
            s, b = work(A)
            rows = work_rows(b, rimm, cid)
            check(S, f"{ck}: pending renewal is REVIEW work (row renewal=pending; Processing 'Review on the record'; Work Items 'Review:')", A,
                  len(rows) == 1 and rows[0].get("renewal") == "pending" and processing_action(rows[0]) == "Review on the record" and wi_verb(rows[0]) == "Review", s, None,
                  rows=[{k: x.get(k) for k in ("state", "renewal", "valid_until")} for x in rows])
            s, b = review(A, dd, "rejected", f"{TAG} r1 renewal illegible", version_id=v2)
            check(S, f"{ck}: renewal v2 rejected with a reason", A, s == 200 and (b or {}).get("review_status") == "rejected", s, code_of(b))
            s, b = readiness(A)
            e = state_of(b, rimm, cid) or {}
            check(S, f"{ck}: a REJECTED renewal is not pending: renewal_pending=false, renewal_rejected=true", A,
                  e.get("renewal_pending") is False and e.get("renewal_rejected") is True, s, None,
                  renewal_pending=e.get("renewal_pending"), renewal_rejected=e.get("renewal_rejected"))
            check(S, f"{ck}: v1 still satisfies until its own date and is still expiring soon (new evidence needed)", A,
                  e.get("state") == "satisfied" and e.get("valid_until") == iso(r1_soon) and e.get("expiring_soon") is True, s, None,
                  state=e.get("state"), valid_until=e.get("valid_until"), expiring_soon=e.get("expiring_soon"))
            s, b = work(A)
            rows = work_rows(b, rimm, cid)
            check(S, f"{ck}: rejected renewal stays RENEW work (row renewal=rejected; Processing 'Renew on the record'; Work Items 'Renew:')", A,
                  len(rows) == 1 and rows[0].get("renewal") == "rejected" and rows[0].get("state") == "expiring_soon"
                  and processing_action(rows[0]) == "Renew on the record" and wi_verb(rows[0]) == "Renew", s, None,
                  rows=[{k: x.get(k) for k in ("state", "renewal", "valid_until")} for x in rows])
            s, b = review(A, dd, "accepted", f"{TAG} r1 old version", version_id=v1)
            check(S, f"{ck}: the superseded v1 cannot be re-decided to clear the renewal (current version only)", A, s == 409 and code_of(b) == "NOT_CURRENT_VERSION", s, code_of(b))
            r1[ck] = {"doc": dd, "v1": v1, "v2": v2}
            save(ids)
        dd, v2 = r1["c2"]["doc"], r1["c2"]["v2"]
        for p in ("doc_reader", "ocr", "scoped_ops", "no_docs", "processing_only"):
            s, b = review(p, dd, "accepted", f"{TAG} r1 unauthorized re-review", version_id=v2)
            check(S, "re-reviewing the rejected renewal needs documents.write and clearance", p, s in (403, 404) and not leaks(b), s, code_of(b))
        s, b = review("cross_org_admin", dd, "accepted", f"{TAG} r1 cross-org re-review", version_id=v2)
        check(S, "another organization: re-review not found", "cross_org_admin", s == 404 and not leaks(b), s, code_of(b))
        s, b = review(A, dd, "accepted", version_id=v2)
        check(S, "re-review of the rejected renewal without a reason is refused", A, s == 400 and code_of(b) == "REASON_REQUIRED", s, code_of(b))
        s, vs = versions(A, dd)
        cur = next((x for x in vs if x.get("id") == v2), {})
        check(S, "refused re-reviews left the renewal rejected", A, cur.get("review_status") == "rejected", s, None, review_status=cur.get("review_status"))
        s, b = review(A, dd, "accepted", f"{TAG} r1 legible on second look", version_id=v2)
        check(S, "c2: authorized re-review (rejected → accepted) with reason", A, s == 200 and (b or {}).get("review_status") == "accepted", s, code_of(b))
        s, b = readiness(A)
        e = state_of(b, rimm, c2) or {}
        check(S, "c2: after re-review: valid-through moves to v2's date, no renewal flags, not expiring", A,
              e.get("state") == "satisfied" and e.get("valid_until") == iso(r1_new) and e.get("renewal_pending") is False
              and e.get("renewal_rejected") is False and e.get("expiring_soon") is False, s, None, valid_until=e.get("valid_until"))
        s, b = work(A)
        check(S, "c2: the renewal work row is gone after re-review", A, not work_rows(b, rimm, c2), s)
        s, h = history(dd)
        check(S, "c2: history keeps the rejection and the re-review (append-only)", A, s == 200 and len(h) >= 4, s, None, actions=h[-6:])

    if ONLY == "R1B":
        S = "R1B-subsequent-acceptance"
        rimm = reqs["imm"]
        r1 = ids["r1"]
        dd, v2 = r1["c3"]["doc"], r1["c3"]["v2"]
        r1_v3 = TODAY + datetime.timedelta(days=400)
        s, b = readiness(A)
        e = state_of(b, rimm, c3) or {}
        check(S, "c3 precondition: renewal still rejected after the browser walk", A, e.get("renewal_rejected") is True and e.get("renewal_pending") is False, s, None,
              renewal_rejected=e.get("renewal_rejected"))
        s, b = renew(A, dd, "r1-imm-c3-v3", f"{TAG} r1 new evidence after rejection", effective_on=iso(TODAY), expires_on=iso(r1_v3))
        v3 = (b or {}).get("version_id")
        check(S, "c3: new evidence (v3) uploaded after the rejection", A, s == 200 and bool(v3) and (b or {}).get("supersedes_version_id") == v2, s, code_of(b))
        s, b = readiness(A)
        e = state_of(b, rimm, c3) or {}
        check(S, "c3: new evidence awaits review: renewal_pending again, not rejected", A, e.get("renewal_pending") is True and e.get("renewal_rejected") is False, s, None)
        s, b = work(A)
        rows = work_rows(b, rimm, c3)
        check(S, "c3: the row turns into REVIEW work", A, len(rows) == 1 and rows[0].get("renewal") == "pending" and wi_verb(rows[0]) == "Review", s, None,
              rows=[{k: x.get(k) for k in ("state", "renewal")} for x in rows])
        s, b = review(A, dd, "accepted", version_id=v3)
        check(S, "c3: subsequent acceptance (v3 first decision)", A, s == 200 and (b or {}).get("review_status") == "accepted", s, code_of(b))
        s, b = readiness(A)
        e = state_of(b, rimm, c3) or {}
        check(S, "c3: accepted new evidence moves valid-through; no renewal flags", A,
              e.get("state") == "satisfied" and e.get("valid_until") == iso(r1_v3) and e.get("renewal_pending") is False and e.get("renewal_rejected") is False, s, None,
              valid_until=e.get("valid_until"))
        s, b = work(A)
        check(S, "c3: the work row is gone", A, not work_rows(b, rimm, c3), s)
        s, vs = versions(A, dd)
        check(S, "c3: all three versions kept, rejected v2 still rejected", A, len(vs) == 3 and any(x.get("id") == v2 and x.get("review_status") == "rejected" for x in vs), s, None, versions=len(vs))

    superseded = []
    if ONLY and os.path.exists(RESULTS_FILE):
        # A section rerun replaces only that section; the replaced results are kept, never discarded.
        prev = json.load(open(RESULTS_FILE))
        superseded = prev.get("superseded_attempts") or []
        mine = [r for r in prev["results"] if r["section"] in RAN]
        superseded.append({"sections": sorted(RAN), "replaced_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                           "reason": REASON, "results": mine})
        results = [r for r in prev["results"] if r["section"] not in RAN] + results
    summary = {"passed": sum(1 for r in results if r["pass"]), "total": len(results)}
    by = {}
    for r in results:
        x = by.setdefault(r["section"], {"passed": 0, "total": 0})
        x["total"] += 1
        x["passed"] += 1 if r["pass"] else 0
    json.dump({"run": RUN, "organization_date": iso(TODAY), "summary": summary, "sections": by, "results": results,
               "superseded_attempts": superseded}, open(RESULTS_FILE, "w"), indent=2)
    print("SECTIONS", json.dumps(by))
    print("SUMMARY", json.dumps(summary))
    sys.exit(0 if summary["passed"] == summary["total"] else 1)

# ----------------------------------------------------------------------------------------------------------------- reset
if PHASE == "reset":
    ids = load()
    out = {}
    for name, rid in (ids.get("requirements") or {}).items():
        s, b = call(f"{REQ}/{rid}", A)
        st = ((b or {}).get("requirement") or {}).get("status") if isinstance(b, dict) else None
        if s == 200 and st != "archived":
            s2, b2 = j(f"{REQ}/{rid}", A, {"action": "archive"}, "PATCH")
            print(f"archive {name}: status={s2} code={code_of(b2)}")
        s, b = call(f"{REQ}/{rid}?qa_run_id={RUN}", A, "DELETE")
        out[f"purge_{name}"] = {"status": s, "purged": (b or {}).get("purged") if isinstance(b, dict) else None}
        print(f"purge {name}: status={s} code={code_of(b)} {json.dumps(out[f'purge_{name}'])}")
    if ids.get("opportunity"):
        s, b = call(f"/api/admin/opportunities/{ids['opportunity']}/delete-preview", A)
        pv = (b or {}).get("preview") or {} if isinstance(b, dict) else {}
        print(f"delete-preview: status={s} blocked={pv.get('blocked')} counts={json.dumps(pv.get('counts'))}")
        s, b = call(f"/api/admin/opportunities/{ids['opportunity']}/delete", A, "POST", b"{}", "application/json")
        out["lead_delete"] = s
        print(f"lead delete: status={s} code={code_of(b)} ok={(b or {}).get('ok') if isinstance(b, dict) else None}")
    for ev, t in (ids.get("types") or {}).items():
        s, b = call(f"{CFG}/types/{t['id']}", A, "DELETE")
        out[f"type_delete_{ev}"] = {"status": s, "code": code_of(b)}
        print(f"delete type {ev}: status={s} code={code_of(b)}")
        if s != 200:
            s2, b2 = j(f"{CFG}/types/{t['id']}", A, {"action": "archive"}, "PATCH")
            out[f"type_archive_{ev}"] = {"status": s2, "code": code_of(b2)}
            print(f"archive type {ev}: status={s2} code={code_of(b2)}")
    gone = {}
    for name, rid in (ids.get("requirements") or {}).items():
        gone[f"requirement_{name}"] = call(f"{REQ}/{rid}", A)[0]
    for key, did in (ids.get("docs") or {}).items():
        gone[f"doc_{key}"] = call(f"/api/admin/documents/{did}/signed-url", A)[0]
    for ev, t in (ids.get("types") or {}).items():
        gone[f"type_{ev}"] = call(f"{CFG}/types/{t['id']}", A)[0]
    if ids.get("household"):
        gone["household_library"] = call(f"/api/admin/documents/library?subject_type=household&subject_id={ids['household']}", A)[0]
    out["after"] = gone
    out["all_gone"] = all(v == 404 for v in gone.values())
    print("RESET", json.dumps(out))
    json.dump(out, open(RESET_FILE, "w"), indent=2)
    sys.exit(0 if out["all_gone"] else 1)
