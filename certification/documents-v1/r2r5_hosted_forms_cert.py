"""Documents V1 fix-forward (PR #1612) — hosted R2 Forms subject scope and R5 lead-deletion cleanup (authz_q1 personas).

Usage: r2r5_hosted_forms_cert.py <qa_run_id> ensure|certify|r5|reset

  ensure   as fixture_admin, through the deployed product's own audited routes:
             * L1: create_lead in QA D1 (inside scoped_ops' department) + children K1 (only this lead) and K2;
             * L2: create_lead in QA D2 (outside scoped_ops' department);
             * L3: a second lead on L1's HOUSEHOLD, if create_lead accepts one, with K2 linked to it
               (POST /api/admin/opportunity-customer-members) — the shared-child precondition. Recorded either way;
             * one run-scoped form with a standard field and a field bound to the child's allergies (medical, FI-01);
             * submissions: s_opp1 (L1 opportunity), s_opp2 (L2 opportunity), s_k1 / s_k2 (child-only, admin-created),
               s_unrel (an L2 child, child-only: the "unrelated" control for R5).
  certify  R2 matrix: authorized reads, single and list, scoped_ops (department QA D1 only) in / out of scope, child-only
           subjects, list filters, opportunity intake-source / enrollment-packets, packet-session list, another
           organization, anonymous, and medical-answer withholding. Writes as scoped_ops are refused by CAPABILITY
           (it has no forms.submissions) — recorded as such, never as scope proof.
  r5       lead deletion of L1: delete-preview counts, then the deletion; K1 and s_k1 are gone; K2 (kept by L3) keeps
           s_k2; L2's submissions are untouched. Then L3's deletion takes K2 and s_k2.
  reset    lead deletion of whatever lead remains; the form is archived (published forms are never deleted).

Never prints a cookie, signed URL or answer content: statuses, booleans and counts.
"""
import json, os, sys, urllib.error, urllib.request

BASE = "https://staging.workwithalloy.com"
AUTH = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.path.dirname(os.path.abspath(__file__))
RUN = sys.argv[1]
PHASE = sys.argv[2]
TAG = f"qa-authz-{RUN}"
SUFFIX = RUN.split("_", 1)[1]
KEY_PREFIX = f"qa_{SUFFIX}_"
STATE_FILE = os.path.join(HERE, f"r2r5_hosted_fixture_ids.{RUN}.json")
RESULTS_FILE = os.path.join(HERE, f"r2r5_hosted_results.{PHASE}.{RUN}.json")
WU1 = "aa000000-0000-4000-8000-000000000101"  # QA D1
WU2 = "aa000000-0000-4000-8000-000000000102"  # QA D2
A = "fixture_admin"
ALLERGY = "qa-r2-allergy-answer"
NOTE = "qa-r2-standard-answer"
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


def load():
    return json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {}


def save(ids):
    json.dump(ids, open(STATE_FILE, "w"), indent=2)


def create_lead(name, wu, extra_ctx=None):
    s, b = j("/api/admin/actions/execute", A, {
        "action_key": "create_lead", "entity_type": "opportunity", "mode": "execute",
        "payload": {"first_name": f"QA R2 {name}", "last_name": SUFFIX, "email": f"qa-r2-{SUFFIX}-{name.lower()}@example.com"},
        "context": {"work_unit_id": wu, "surface": "work_unit", **(extra_ctx or {})},
    })
    data = (b or {}).get("data") or {} if isinstance(b, dict) else {}
    er = data.get("execution_result") or {}
    detail = er.get("detail") or {} if isinstance(er, dict) else {}
    opp = data.get("affected_id") or detail.get("opportunity_id") or (er.get("affectedId") if isinstance(er, dict) else None)
    print(f"create_lead {name}: status={s} has_opp={bool(opp)} mode={detail.get('mode')}")
    return opp


def household_of(opp):
    s, b = call(f"/api/admin/documents/library?subject_type=opportunity&subject_id={opp}", A)
    return (((b or {}).get("library") or {}).get("household") or {}).get("id") if isinstance(b, dict) else None


def add_child(hh, first):
    s, b = j("/api/admin/customer-members", A, {"customer_id": hh, "display_name": f"QA R2 {first} {SUFFIX}", "relationship": "child",
                                                 "first_name": f"QA R2 {first}", "last_name": SUFFIX})
    row = ((b or {}).get("member") or (b or {}).get("row") or (b or {}).get("data") or b) if isinstance(b, dict) else {}
    if isinstance(row, dict) and isinstance(row.get("member"), dict):
        row = row["member"]
    mid = row.get("id") if isinstance(row, dict) else None
    print(f"child {first}: status={s} has_id={bool(mid)}")
    return mid


def sub_rows(b):
    d = (b or {}).get("data") if isinstance(b, dict) else None
    return d if isinstance(d, list) else []


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
    for k, lead, first in (("K1", "L1", "Kid One"), ("K2", "L1", "Kid Two"), ("KU", "L2", "Kid Unrelated")):
        if k not in ids:
            mid = add_child(ids[lead]["hh"], first)
            if not mid:
                sys.exit(1)
            ids[k] = mid
            save(ids)
    # Shared child precondition: a second lead on L1's household, K2 linked to it.
    if "L3" not in ids:
        opp3 = create_lead("L3", WU1, {"customer_id": ids["L1"]["hh"]})
        hh3 = household_of(opp3) if opp3 else None
        ids["L3"] = {"opp": opp3, "hh": hh3, "same_household": bool(hh3 and hh3 == ids["L1"]["hh"])}
        save(ids)
        if ids["L3"]["same_household"]:
            s, b = j("/api/admin/opportunity-customer-members", A, {"opportunity_id": opp3, "customer_member_id": ids["K2"]})
            ids["L3"]["ocm_k2"] = s
            save(ids)
            print(f"OCM K2→L3: status={s}")
        else:
            print("L3: create_lead did not attach to L1's household — shared-child precondition NOT available")
    if "form" not in ids:
        s, b = j("/api/admin/forms", A, {"name": f"{TAG} R2 scope form", "key": f"{KEY_PREFIX}r2form", "kind": "center", "is_active": True,
                                         "description": "R2 hosted certification fixture"})
        fid = ((b or {}).get("data") or {}).get("id")
        schema = {"schema_version": 1, "title": f"{TAG} R2 scope form",
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
    specs = {"s_opp1": {"opportunity_id": ids["L1"]["opp"]}, "s_opp2": {"opportunity_id": ids["L2"]["opp"]},
             "s_k1": {"customer_member_id": ids["K1"]}, "s_k2": {"customer_member_id": ids["K2"]}, "s_unrel": {"customer_member_id": ids["KU"]}}
    for k, subj in specs.items():
        if k in subs:
            continue
        s, b = j("/api/admin/forms/submissions", A, {"form_definition_version_id": ids["form"]["version_id"], **subj,
                                                     "payload": {"values": {"child_note": f"{NOTE} {TAG}", "allergy_list": f"{ALLERGY} {TAG}"}}})
        sid = ((b or {}).get("data") or {}).get("id")
        print(f"submission {k}: status={s} has_id={bool(sid)}")
        if not sid:
            sys.exit(1)
        subs[k] = sid
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
    json.dump({"run": RUN, "phase": PHASE, "summary": summary, "sections": by, "results": results}, open(RESULTS_FILE, "w"), indent=2)
    print("SECTIONS", json.dumps(by))
    print("SUMMARY", json.dumps(summary))
    sys.exit(0 if summary["passed"] == summary["total"] else 1)


# --------------------------------------------------------------------------------------------------------------- certify
if PHASE == "certify":
    ids = load()
    subs = ids["subs"]
    ours = set(subs.values())
    L1, L2 = ids["L1"]["opp"], ids["L2"]["opp"]

    def one(p, k):
        s, b = call(f"/api/admin/forms/submissions/{subs[k]}", p)
        return s, ((b or {}).get("data") or {}) if isinstance(b, dict) else {}

    def listed(p, q=""):
        s, b = call(f"/api/admin/forms/submissions?limit=500{q}", p)
        return s, {r.get("id") for r in sub_rows(b)} & ours, b

    def leaks(b):
        raw = json.dumps(b)
        return any(x in raw for x in (TAG, NOTE, ALLERGY))

    S = "R2-authorized"
    for p in (A, "doc_reader"):
        for k in subs:
            s, d = one(p, k)
            check(S, f"unrestricted reader reads {k}", p, s == 200 and d.get("id") == subs[k], s)
        s, got, _ = listed(p)
        check(S, "unrestricted list includes every run submission", p, s == 200 and got == ours, s, None, listed=len(got))
        s, got, _ = listed(p, f"&customer_member_id={ids['K1']}")
        check(S, "list filtered by child K1 returns its child-only submission", p, s == 200 and got == {subs["s_k1"]}, s, None, listed=len(got))

    S = "R2-department-scope"
    P = "scoped_ops"
    s, d = one(P, "s_opp1")
    check(S, "in scope (opportunity in QA D1): single read 200", P, s == 200 and d.get("id") == subs["s_opp1"], s)
    for k, why in (("s_opp2", "opportunity in QA D2"), ("s_k1", "child-only submission"), ("s_k2", "child-only submission"), ("s_unrel", "child-only (QA D2 household)")):
        s, b = call(f"/api/admin/forms/submissions/{subs[k]}", P)
        check(S, f"out of scope ({why}): {k} is 404 and names nothing", P, s == 404 and not leaks(b), s, code_of(b))
    s, got, b = listed(P)
    check(S, "unfiltered list: only the in-scope submission", P, s == 200 and got == {subs["s_opp1"]}, s, None, listed=sorted(k for k, v in subs.items() if v in got))
    for q, why in ((f"&customer_member_id={ids['K1']}", "child K1"), (f"&opportunity_id={L2}", "QA D2 opportunity"), (f"&customer_id={ids['L1']['hh']}", "L1 household")):
        s, got, b = listed(P, q)
        check(S, f"list filtered by an out-of-scope subject ({why}) is empty, not a refusal", P, s == 200 and not got and not leaks(b), s, None)
    s, got, _ = listed(P, f"&opportunity_id={L1}")
    check(S, "list filtered by the in-scope opportunity returns it", P, s == 200 and got == {subs["s_opp1"]}, s)
    for path, name in ((f"/api/admin/opportunities/{L1}/intake-source", "intake-source"), (f"/api/admin/opportunities/{L1}/enrollment-packets", "enrollment-packets")):
        s, b = call(path, P)
        check(S, f"{name} for the in-scope opportunity is served", P, s == 200, s, code_of(b))
    for path, name in ((f"/api/admin/opportunities/{L2}/intake-source", "intake-source"), (f"/api/admin/opportunities/{L2}/enrollment-packets", "enrollment-packets")):
        s, b = call(path, P)
        check(S, f"{name} for the out-of-scope opportunity is 404", P, s == 404 and not leaks(b), s, code_of(b))
    sa, ba = call("/api/admin/forms/packet-sessions", A)
    sp, bp = call("/api/admin/forms/packet-sessions", P)
    na, np_ = len(sub_rows(ba)), len(sub_rows(bp))
    check(S, "packet-session list is served scoped (EMPTY org: no session exists, so this does not prove scope filtering)", P,
          sa == 200 and sp == 200 and np_ <= na, sp, None, admin_sessions=na, scoped_sessions=np_, proves_scope=na > 0)
    s, b = j("/api/admin/forms/submissions", P, {"form_definition_version_id": ids["form"]["version_id"], "opportunity_id": L2, "payload": {"values": {}}})
    check(S, "write as scoped_ops is refused (403 = CAPABILITY, no forms.submissions — not a scope proof)", P, s in (403, 404), s, code_of(b))

    S = "R2-organization"
    for k in subs:
        s, b = call(f"/api/admin/forms/submissions/{subs[k]}", "cross_org_admin")
        check(S, f"another organization: {k} is 404", "cross_org_admin", s == 404 and not leaks(b), s, code_of(b))
    s, got, b = listed("cross_org_admin")
    check(S, "another organization's list holds none of ours", "cross_org_admin", s == 200 and not got and not leaks(b), s)
    s, got, b = listed("cross_org_admin", f"&customer_member_id={ids['K1']}")
    check(S, "another organization filtering by our child gets nothing", "cross_org_admin", s == 200 and not got, s)

    S = "R2-anonymous"
    for path in ("/api/admin/forms/submissions", f"/api/admin/forms/submissions/{subs['s_opp1']}", "/api/admin/forms/packet-sessions",
                 f"/api/admin/opportunities/{L1}/intake-source"):
        s, b = call(path)
        check(S, f"anonymous refused: {path.split('/api/admin/')[1].split('/')[0:2]}", "anonymous", s == 401 and not leaks(b), s, code_of(b))

    S = "R2-medical"
    s, d = one(A, "s_k1")
    vals = ((d.get("payload") or {}).get("values") or {})
    check(S, "with health.view: the allergy answer is present", A, s == 200 and ALLERGY in str(vals.get("allergy_list")), s)
    s, d = one("doc_reader", "s_k1")
    p = d.get("payload") or {}
    vals = p.get("values") or {}
    check(S, "without health.view: the allergy answer is withheld (absent, flagged), the standard answer kept", "doc_reader",
          s == 200 and "allergy_list" not in vals and (p.get("meta") or {}).get("medical_answers_withheld") is True and NOTE in str(vals.get("child_note")), s,
          None, withheld=(p.get("meta") or {}).get("medical_answers_withheld"))
    s, got, b = listed("doc_reader", f"&customer_member_id={ids['K1']}")
    check(S, "without health.view: the list withholds it too", "doc_reader", s == 200 and ALLERGY not in json.dumps(b), s)
    s, d = one(P, "s_opp1")
    vals = ((d.get("payload") or {}).get("values") or {})
    check(S, "scoped_ops (no health.view) in scope: allergy withheld", P, s == 200 and "allergy_list" not in vals, s)
    finish()

# -------------------------------------------------------------------------------------------------------------------- r5
if PHASE == "r5":
    ids = load()
    subs = ids["subs"]
    S = "R5"

    def sub_status(k):
        return call(f"/api/admin/forms/submissions/{subs[k]}", A)[0]

    def child_status(mid):
        return call(f"/api/admin/documents/library?subject_type=child&subject_id={mid}", A)[0]

    shared = bool(ids.get("L3", {}).get("same_household") and ids["L3"].get("ocm_k2") in (200, 201))
    before = {k: sub_status(k) for k in subs}
    check(S, "before: every run submission exists", A, all(v == 200 for v in before.values()), None, None, before=before)
    s, b = call(f"/api/admin/opportunities/{ids['L1']['opp']}/delete-preview", A)
    pv = (b or {}).get("preview") or {} if isinstance(b, dict) else {}
    counts = pv.get("will_delete") or {}  # the preview's per-table deletion counts (`counts` is the subject summary)
    exp = 3 if not shared else 2  # s_opp1 + s_k1 (+ s_k2 unless K2 is kept by L3)
    check(S, "L1 delete-preview counts its submissions (opportunity + deleted children's own)", A, s == 200 and not pv.get("blocked")
          and counts.get("form_submissions") == exp, s, None, form_submissions=counts.get("form_submissions"), expected=exp, shared_child=shared)
    s, b = call(f"/api/admin/opportunities/{ids['L1']['opp']}/delete", A, "POST", b"{}", "application/json")
    check(S, "L1 lead deletion (audited product route)", A, s == 200 and (b or {}).get("ok") is not False, s, code_of(b),
          deleted=((b or {}).get("deleted") if isinstance(b, dict) else None))
    ids["L1"]["deleted"] = s == 200
    save(ids)
    after = {k: sub_status(k) for k in subs}
    check(S, "the deleted child's child-only submission (s_k1) is gone", A, after["s_k1"] == 404, after["s_k1"])
    check(S, "the deleted opportunity's submission (s_opp1) is gone", A, after["s_opp1"] == 404, after["s_opp1"])
    check(S, "the deleted child K1 is gone", A, child_status(ids["K1"]) == 404, child_status(ids["K1"]))
    check(S, "unrelated submissions (L2 opportunity, L2 child) are unchanged", A, after["s_opp2"] == 200 and after["s_unrel"] == 200, None, None,
          s_opp2=after["s_opp2"], s_unrel=after["s_unrel"])
    if shared:
        check(S, "shared child K2 (kept by L3) keeps its submission", A, after["s_k2"] == 200, after["s_k2"])
        check(S, "shared child K2 itself is kept", A, child_status(ids["K2"]) == 200, child_status(ids["K2"]))
        s, b = call(f"/api/admin/opportunities/{ids['L3']['opp']}/delete-preview", A)
        pv = (b or {}).get("preview") or {} if isinstance(b, dict) else {}
        check(S, "L3 delete-preview now counts K2's submission", A, s == 200 and (pv.get("will_delete") or {}).get("form_submissions") == 1, s, None,
              form_submissions=(pv.get("will_delete") or {}).get("form_submissions"))
        s, b = call(f"/api/admin/opportunities/{ids['L3']['opp']}/delete", A, "POST", b"{}", "application/json")
        ids["L3"]["deleted"] = s == 200
        save(ids)
        check(S, "L3 deletion then takes K2's submission", A, s == 200 and sub_status("s_k2") == 404, s)
    else:
        check(S, "shared-child precondition available (second lead on the same household)", A, False, None, None,
              note="create_lead did not attach to the existing household; shared-child preservation NOT proven on hosted")
        check(S, "K2 (not shared) went with L1 and took its own submission", A, after["s_k2"] == 404, after["s_k2"])
    finish()

# ----------------------------------------------------------------------------------------------------------------- reset
if PHASE == "reset":
    ids = load()
    out = {}
    # R5 second measurement (L2: its opportunity submission + its child's own child-only submission), taken before L2 goes.
    subs = ids.get("subs") or {}
    if (ids.get("L2") or {}).get("opp") and not ids["L2"].get("deleted"):
        s, b = call(f"/api/admin/opportunities/{ids['L2']['opp']}/delete-preview", A)
        pv = (b or {}).get("preview") or {} if isinstance(b, dict) else {}
        wd = pv.get("will_delete") or {}
        out["r5_l2_preview"] = {"status": s, "blocked": pv.get("blocked"), "form_submissions": wd.get("form_submissions"), "expected": 2,
                                "children": wd.get("children"), "will_retain": pv.get("will_retain")}
        print(f"R5 L2 preview: {json.dumps(out['r5_l2_preview'])}")
    for k in ("L1", "L3", "L2"):
        L = ids.get(k) or {}
        if L.get("opp") and not L.get("deleted"):
            s, b = call(f"/api/admin/opportunities/{L['opp']}/delete", A, "POST", b"{}", "application/json")
            out[f"delete_{k}"] = s
            print(f"lead delete {k}: status={s} code={code_of(b)}")
            if s == 200:
                L["deleted"] = True
                save(ids)
    if ids.get("form"):
        fid = ids["form"]["id"]
        s, b = call(f"/api/admin/forms/{fid}", A, "DELETE")
        out["form_delete"] = s
        if s != 200:
            s2, b2 = call(f"/api/admin/forms/{fid}/archive", A, "POST", b"{}", "application/json")
            out["form_archive"] = s2
        print(f"form: delete={s} archive={out.get('form_archive')}")
    gone = {f"sub_{k}": call(f"/api/admin/forms/submissions/{v}", A)[0] for k, v in (ids.get("subs") or {}).items()}
    for k in ("L1", "L2", "L3"):
        if (ids.get(k) or {}).get("opp"):
            gone[f"opp_{k}"] = call(f"/api/admin/opportunities/{ids[k]['opp']}/delete-preview", A)[0]
    out["after"] = gone
    out["all_gone"] = all(v == 404 for v in gone.values())
    if "r5_l2_preview" in out:
        out["r5_l2_pass"] = out["r5_l2_preview"]["form_submissions"] == 2 and gone.get("sub_s_unrel") == 404 and gone.get("sub_s_opp2") == 404
    out["retained_by_design"] = {"form_definition": "published form archived (Forms never deletes a published definition)"}
    print("RESET", json.dumps(out))
    json.dump(out, open(os.path.join(HERE, f"r2r5_hosted_reset_results.{RUN}.json"), "w"), indent=2)
    sys.exit(0 if out["all_gone"] else 1)
