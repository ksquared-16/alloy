"""Documents V1 / D4.7 — hosted Focus Panel household library certification (authz_q1 personas).

Usage: d4_hosted_library_cert.py <qa_run_id> ensure|certify|reset [ui]

The optional `ui` variant builds a second household for the deployed Human-QA walk. WU1 (QA D1) has no Business Process,
so its case never appears in a Work View and the Focus Panel cannot be opened on it by clicking; the `ui` household takes
create_lead's default placement (the org's lead-intake Work View) instead. Same lifecycle, separate state file.

QA Shared has no household with several adults and children, so this driver owns a run-scoped HOUSEHOLD FIXTURE built
and removed only through the deployed product's own audited routes, as the run's fixture_admin session:

  ensure   create_lead (household + primary adult + case in WU1 / QA D1) → add_parent_guardian (second adult) →
           POST /api/admin/customer-members ×2 (children) → uploads to household, each adult, each child and the case,
           a medical document on a child, a quarantined (scripted) PDF on a child, a document shared between both
           children, a replacement version, and a context link from an out-of-scope Q1 document (OPP2 / QA D2).
  certify  GET /api/admin/documents/library from every anchor and persona; history; version links.
  reset    audited POS document deletes → POST /api/admin/opportunities/[id]/delete (the lead-deletion graph removes the
           household, its members and its adults) → verifies every fixture id is gone.

  orphans  the lead-deletion graph keeps a guardian linked ONLY through customer_persons (its person set is the primary
           person, opportunity_persons and customer_members.person_id), leaving that persons row orphaned. Measured on
           this run (d47-household-residue-census: persons 6 vs baseline 4). This phase removes each such adult the
           same audited way: a temporary run-tagged lead, link_existing_person (scope this_opportunity → writes
           opportunity_persons), then POST /api/admin/opportunities/[id]/delete.

Residue is measured independently by d47-household-baseline-census.sql (before) and d47-household-residue-census.sql
(after). Synthetic names/emails only (qa-d47-<run>-*@example.com). Never prints a cookie, signed URL or content.
"""
import json, os, sys, time, urllib.request, urllib.error, uuid

BASE = "https://staging.workwithalloy.com"
AUTH = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.path.dirname(os.path.abspath(__file__))
RUN = sys.argv[1]
PHASE = sys.argv[2]
TAG = f"qa-authz-{RUN}"
SUFFIX = RUN.split("_", 1)[1]
VARIANT = sys.argv[3] if len(sys.argv) > 3 else ""
VTAG = f"-{VARIANT}" if VARIANT else ""
STATE_FILE = os.path.join(HERE, f"d4_hosted_fixture_ids{VTAG}.{RUN}.json")
RESULTS_FILE = os.path.join(HERE, f"d4_hosted_library_cert_results{VTAG}.{RUN}.json")
Q1_STATE = os.path.join(HERE, f"q1_hosted_fixture_ids.{RUN}.json")

WU1 = "aa000000-0000-4000-8000-000000000101"  # QA D1 (in scope for scoped_ops)
OPP2 = "aa000000-0000-4000-8000-000000000112"  # WU2 in QA D2 (out of scope for scoped_ops)
OPPX = "aa000000-0000-4000-8000-000000000211"  # QA Secondary subject
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
    text = f"QA authz D4 fixture {label}"
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


def upload(persona, key, fields, content=None):
    body, ct = multipart({**fields, "title": f"{TAG} {key}"}, f"{TAG}-{key}.pdf", content or tiny_pdf(key), "application/pdf")
    return call("/api/admin/documents/upload", persona, "POST", body, ct)


def doc_of(b):
    d = (b or {}).get("document") if isinstance(b, dict) else None
    return d.get("id") if isinstance(d, dict) else None


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
    return f"qa-d47-{SUFFIX}{VTAG}-{k}@example.com"


# ---------------------------------------------------------------------------------------------------------------- ensure
if PHASE == "ensure":
    ids = load()
    A = "fixture_admin"
    if "opportunity" not in ids:
        s, b = j("/api/admin/actions/execute", A, {
            "action_key": "create_lead", "entity_type": "opportunity", "mode": "execute",
            "payload": {"first_name": "QA D47 Adult", "last_name": f"One{VTAG.upper()} {SUFFIX}", "email": email("a1")},
            "context": ({"work_unit_id": WU1, "surface": "work_unit"} if not VARIANT else {"surface": "work_unit"}),
        })
        data = (b or {}).get("data") or {} if isinstance(b, dict) else {}
        er = data.get("execution_result") or {}
        detail = er.get("detail") or {} if isinstance(er, dict) else {}
        opp = data.get("affected_id") or detail.get("opportunity_id") or (er.get("affectedId") if isinstance(er, dict) else None)
        print(f"create_lead: status={s} code={code_of(b)} mode={detail.get('mode')} has_opp={bool(opp)} keys={sorted((b or {}).keys()) if isinstance(b, dict) else None}")
        if not opp or detail.get("mode") == "processing_review":
            print(json.dumps({k: v for k, v in (b or {}).items() if k in ("error", "code", "message")}))
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
            "customer_id": hh, "display_name": f"QA D47 {first}{VTAG.upper()} {SUFFIX}", "relationship": "child",
            "first_name": f"QA D47 {first}{VTAG.upper()}", "last_name": SUFFIX,
        })
        row = ((b or {}).get("member") or (b or {}).get("row") or (b or {}).get("data") or b) if isinstance(b, dict) else {}
        if isinstance(row, dict) and isinstance(row.get("member"), dict):
            row = row["member"]
        mid = row.get("id") if isinstance(row, dict) else None
        print(f"customer-member {k}: status={s} code={code_of(b)} has_id={bool(mid)} keys={sorted((b or {}).keys()) if isinstance(b, dict) else None}")
        if not mid:
            sys.exit(1)
        ids[k] = mid
        ids[k + "_person"] = row.get("person_id")
        save(ids)

    if "adult2" not in ids:
        s, b = j("/api/admin/actions/execute", A, {
            "action_key": "add_parent_guardian", "entity_type": "opportunity", "entity_id": opp, "mode": "execute",
            "payload": {"customer_id": hh, "source_entity_type": "opportunity", "source_record_id": opp, "source_opportunity_id": opp, "scope": "this_child", "anchor_customer_member_id": ids["child1"], "create_person_draft": {"first_name": "QA D47 Adult", "last_name": f"Two{VTAG.upper()} {SUFFIX}", "email": email("a2")}},
        })
        print(f"add_parent_guardian: status={s} ok={(b or {}).get('ok') if isinstance(b, dict) else None} error={json.dumps((b or {}).get('error')) if isinstance(b, dict) else None}")
        s, b = library(A, "opportunity", opp)
        adults = [x["subject_id"] for x in ((b or {}).get("library") or {}).get("subjects", []) if x.get("role") == "adult"]
        new = [a for a in adults if a != ids["adult1"]]
        if not new:
            print(f"second adult not visible in the library: adults={len(adults)}")
            sys.exit(1)
        ids["adult2"] = new[0]
        save(ids)

    docs = ids.setdefault("docs", {})
    plan = [
        ("hh", {"entity_type": "customer", "entity_id": hh, "doc_type": "other"}, None),
        ("a1", {"entity_type": "person", "entity_id": ids["adult1"], "doc_type": "other"}, None),
        ("a2", {"entity_type": "person", "entity_id": ids["adult2"], "doc_type": "other"}, None),
        ("c1", {"entity_type": "customer_member", "entity_id": ids["child1"], "doc_type": "other"}, None),
        ("c2", {"entity_type": "customer_member", "entity_id": ids["child2"], "doc_type": "other"}, None),
        ("case", {"entity_type": "opportunity", "entity_id": opp, "doc_type": "other"}, None),
        ("med", {"entity_type": "customer_member", "entity_id": ids["child1"], "doc_type": "immunization_record"}, None),
        ("shared", {"entity_type": "customer_member", "entity_id": ids["child1"], "doc_type": "other"}, None),
        ("held", {"entity_type": "customer_member", "entity_id": ids["child2"], "doc_type": "other"}, JS_PDF),
    ]
    for key, fields, content in plan:
        if key in docs:
            continue
        s, b = upload(A, key, fields, content)
        did = doc_of(b)
        scr = ((b or {}).get("screening") or {}).get("verdict") if isinstance(b, dict) else None
        print(f"upload {key}: status={s} code={code_of(b)} has_id={bool(did)} screening={scr}")
        if not did:
            sys.exit(1)
        docs[key] = did
        save(ids)

    if not ids.get("shared_linked"):
        s, b = j(f"/api/admin/documents/{docs['shared']}/subjects", A, {"action": "link", "subject_type": "child", "subject_id": ids["child2"], "association": "context"})
        print(f"link shared → child2: status={s} code={code_of(b)}")
        if s != 200:
            sys.exit(1)
        ids["shared_linked"] = True
        save(ids)

    if not ids.get("a1_replaced"):
        body, ct = multipart({"reason": "QA D4.7 replacement fixture version two"}, f"{TAG}-a1-v2.pdf", tiny_pdf("a1 v2"), "application/pdf")
        s, b = call(f"/api/admin/documents/{docs['a1']}/versions", A, "POST", body, ct)
        print(f"replace a1 → v2: status={s} code={code_of(b)}")
        if s not in (200, 201):
            sys.exit(1)
        ids["a1_replaced"] = True
        save(ids)

    if VARIANT:
        print("ENSURE", json.dumps({k: (bool(v) if not isinstance(v, dict) else sorted(v)) for k, v in ids.items()}))
        sys.exit(0)
    if "outside" not in ids:
        q1 = json.load(open(Q1_STATE))
        ids["outside"] = q1["wu2"]["id"]  # owned by OPP2 (QA D2), out of scoped_ops scope
        save(ids)
    if not ids.get("outside_linked"):
        s, b = j(f"/api/admin/documents/{ids['outside']}/subjects", A, {"action": "link", "subject_type": "opportunity", "subject_id": opp, "association": "context"})
        print(f"link outside(OPP2) → case: status={s} code={code_of(b)}")
        if s != 200:
            sys.exit(1)
        ids["outside_linked"] = True
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
    D = ids["docs"]
    opp, hh = ids["opportunity"], ids["household"]
    A = "fixture_admin"
    HOUSEHOLD_DOCS = {D[k] for k in ("hh", "a1", "a2", "c1", "c2", "case", "med", "shared")}

    def listed(b):
        return [d["id"] for d in (((b or {}).get("library") or {}).get("documents") or [])]

    def doc(b, did):
        return next((d for d in (((b or {}).get("library") or {}).get("documents") or []) if d["id"] == did), None)

    # 1. Shape from the case anchor (fixture_admin: full access incl. health.view).
    s, b = library(A, "opportunity", opp)
    lib = (b or {}).get("library") or {}
    roles = sorted(x.get("role") for x in lib.get("subjects", []))
    check("case anchor resolves the household", A, s == 200 and (lib.get("household") or {}).get("id") == hh, s, code_of(b))
    check("household subjects: 1 household, 2 adults, 2 children, the case", A,
          roles.count("household") == 1 and roles.count("adult") == 2 and roles.count("child") == 2 and roles.count("case") >= 1, s, None, roles=roles)
    got = listed(b)
    check("every household document is listed", A, HOUSEHOLD_DOCS <= set(got), s, None, missing=len(HOUSEHOLD_DOCS - set(got)))
    check("shared document listed once", A, got.count(D["shared"]) == 1, s, None, count=got.count(D["shared"]))
    sh = doc(b, D["shared"]) or {}
    assoc = sorted((a["subject_type"], a["association"]) for a in sh.get("associations", []))
    check("shared document: owner child1 + context child2", A,
          (sh.get("owner") or {}).get("subject_id") == ids["child1"] and ("child", "context") in assoc and ("child", "owner") in assoc, s, None, associations=assoc)
    check("quarantined document never listed", A, D["held"] not in got, s, None)
    out = doc(b, ids["outside"]) or {}
    check("out-of-household document reached by a context link is owned_elsewhere, owner not named", A,
          bool(out) and out.get("owned_elsewhere") is True and out.get("owner") is None, s, None, listed=bool(out))
    a1 = doc(b, D["a1"]) or {}
    check("replaced document shows version 2 of 2", A,
          (a1.get("current_version") or {}).get("version_number") == 2 and a1.get("version_count") == 2, s, None,
          version=(a1.get("current_version") or {}).get("version_number"), count=a1.get("version_count"))
    for key, expect in (("hh", "household"), ("a1", "person"), ("c1", "child"), ("case", "opportunity")):
        d = doc(b, D[key]) or {}
        check(f"{key}: primary owner is the {expect}", A, (d.get("owner") or {}).get("subject_type") == expect, s, None,
              owner_type=(d.get("owner") or {}).get("subject_type"))
    med = doc(b, D["med"]) or {}
    check("medical document carries the medical sensitivity", A, med.get("sensitivity") == "medical", s, None, sensitivity=med.get("sensitivity"))

    # 2. Every anchor resolves the same household and the same documents.
    for st, sid in (("household", hh), ("person", ids["adult2"]), ("child", ids["child2"])):
        s, b2 = library(A, st, sid)
        lb = (b2 or {}).get("library") or {}
        check(f"{st} anchor resolves the same household", A, s == 200 and (lb.get("household") or {}).get("id") == hh
              and HOUSEHOLD_DOCS <= set(listed(b2)), s, code_of(b2))

    # 3. Server-side focus narrowing.
    s, b2 = library(A, "opportunity", opp, ("child", ids["child2"]))
    g2 = set(listed(b2))
    check("focus child2: only documents linked to child2", A, s == 200 and g2 == {D["c2"], D["shared"]}, s, code_of(b2),
          n=len(g2), extra=len(g2 - {D["c2"], D["shared"]}))
    s, b2 = library(A, "opportunity", opp, ("person", ids["adult1"]))
    check("focus adult1: only adult1's document", A, s == 200 and set(listed(b2)) == {D["a1"]}, s, code_of(b2), n=len(listed(b2)))

    # 4. Personas.
    s, b2 = library("doc_reader", "opportunity", opp)
    g = set(listed(b2))
    check("doc_reader sees the household library", "doc_reader", s == 200 and (HOUSEHOLD_DOCS - {D["med"]}) <= g, s, code_of(b2))
    check("doc_reader: medical withheld without health.view", "doc_reader", D["med"] not in g, s, None)
    s, b2 = call(f"/api/admin/documents/{D['med']}/history", "doc_reader")
    check("doc_reader: medical history refused", "doc_reader", s in (403, 404), s, code_of(b2))
    for p in ("no_docs", "processing_only"):
        s, b2 = library(p, "opportunity", opp)
        check("library refused without documents.read", p, s in (401, 403), s, code_of(b2))
    s, b2 = library("scoped_ops", "opportunity", opp)
    g = set(listed(b2))
    check("scoped_ops (QA D1) sees the in-scope household", "scoped_ops", s == 200 and D["case"] in g, s, code_of(b2))
    check("scoped_ops: context link to an out-of-scope document grants nothing", "scoped_ops", ids["outside"] not in g, s, None)
    s, b2 = library("scoped_ops", "opportunity", OPP2)
    check("scoped_ops: out-of-scope case anchor is 404", "scoped_ops", s == 404, s, code_of(b2))
    for st, sid in (("opportunity", opp), ("household", hh), ("child", ids["child1"])):
        s, b2 = library("cross_org_admin", st, sid)
        check(f"cross-org {st} anchor is 404", "cross_org_admin", s == 404, s, code_of(b2))
    s, b2 = library("cross_org_admin", "opportunity", OPPX)
    check("cross-org admin's own case shows nothing from QA Shared", "cross_org_admin", s == 200 and not (HOUSEHOLD_DOCS & set(listed(b2))), s, code_of(b2))
    s, b2 = library(None, "opportunity", opp)
    check("unauthenticated library refused", None, s == 401, s, code_of(b2))
    s, b2 = call(f"/api/admin/documents/library?subject_type=widget&subject_id={opp}", A)
    check("bad subject type is 400", A, s == 400, s, code_of(b2))

    # 5. Quarantine refusals.
    s, b2 = call(f"/api/admin/documents/{D['held']}/history", A)
    check("quarantined: history refused", A, s == 403 and code_of(b2) == "DOCUMENT_RESTRICTED", s, code_of(b2))
    s, b2 = call(f"/api/admin/documents/{D['held']}/signed-url", A)
    check("quarantined: link refused", A, s == 403 and code_of(b2) == "DOCUMENT_RESTRICTED", s, code_of(b2))

    # 6. Versions and version-specific links.
    s, b2 = call(f"/api/admin/documents/{D['a1']}/versions", A)
    vs = (b2 or {}).get("versions") or []
    check("a1 has two versions", A, s == 200 and len(vs) == 2, s, code_of(b2), n=len(vs))
    for v in vs:
        s3, b3 = call(f"/api/admin/documents/{D['a1']}/signed-url?version={v['id']}", A)
        check(f"version {v.get('version_number')} link issued", A, s3 == 200 and bool((b3 or {}).get("url") or (b3 or {}).get("signedUrl") or (b3 or {}).get("signed_url")), s3, code_of(b3))

    # 7. History classification (after the links above, so 'access' entries exist).
    body, ct = multipart({"reason": "QA D4.7 refused replacement (active content)"}, f"{TAG}-a2-bad.pdf", JS_PDF, "application/pdf")
    s, b2 = call(f"/api/admin/documents/{D['a2']}/versions", A, "POST", body, ct)
    check("replacement with active content refused", A, s >= 400, s, code_of(b2))
    s, b2 = call(f"/api/admin/documents/{D['a1']}/history", A)
    kinds = [e.get("kind") for e in ((b2 or {}).get("entries") or [])]
    acts = [e.get("action") for e in ((b2 or {}).get("entries") or [])]
    check("a1 history: upload and replacement committed, link access recorded", A,
          s == 200 and "Uploaded" in acts and any(str(a).startswith("Replaced with version 2") for a in acts) and "access" in kinds, s, code_of(b2), kinds=sorted(set(kinds)))
    s, b2 = call(f"/api/admin/documents/{D['a2']}/history", A)
    kinds2 = [e.get("kind") for e in ((b2 or {}).get("entries") or [])]
    acts2 = [e.get("action") for e in ((b2 or {}).get("entries") or [])]
    # Screening runs BEFORE the audit (versions/route.ts), so a screening refusal is not an audited attempt: history must
    # record no replacement at all, and the document stays at one version. ("refused" is for an audited attempt whose
    # commit then failed — covered by the unit suite; not producible on hosted without fault injection.)
    s4, b4 = call(f"/api/admin/documents/{D['a2']}/versions", A)
    check("a2 history: screening-refused replacement is not shown as a version; still one version", A,
          s == 200 and "Uploaded" in acts2 and not any(str(a).startswith("Replaced") for a in acts2)
          and len((b4 or {}).get("versions") or []) == 1, s, code_of(b2), kinds=sorted(set(kinds2)))
    s, b2 = call(f"/api/admin/documents/{D['shared']}/history", A)
    acts3 = [e.get("action") for e in ((b2 or {}).get("entries") or [])]
    check("shared history: context association committed", A, s == 200 and sum(str(a).startswith("Associated") for a in acts3) >= 2, s, code_of(b2))

    passed = sum(r["pass"] for r in results)
    summary = {"passed": passed, "total": len(results), "qa_run_id": RUN, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    json.dump({"summary": summary, "results": results}, open(RESULTS_FILE, "w"), indent=2)
    print("\nSUMMARY", json.dumps(summary))
    sys.exit(0 if passed == len(results) else 1)

# ----------------------------------------------------------------------------------------------------------------- reset
if PHASE == "reset":
    ids = load()
    A = "fixture_admin"
    out = {}
    if ids.get("outside_linked") and ids.get("opportunity"):
        s, b = j(f"/api/admin/documents/{ids['outside']}/subjects", A, {"action": "unlink", "subject_type": "opportunity", "subject_id": ids["opportunity"]})
        out["unlink_outside"] = s
        print(f"unlink outside: status={s} code={code_of(b)}")
    for key, did in (ids.get("docs") or {}).items():
        s, b = call(f"/api/admin/pos/documents/{did}", A, "DELETE")
        s2, _ = call(f"/api/admin/documents/{did}/signed-url", A)
        out[f"doc_{key}"] = [s, s2]
        print(f"delete {key}: status={s} code={code_of(b)} then link={s2}")
    if ids.get("opportunity"):
        s, b = call(f"/api/admin/opportunities/{ids['opportunity']}/delete-preview", A)
        pv = (b or {}).get("preview") or {} if isinstance(b, dict) else {}
        print(f"delete-preview: status={s} blocked={pv.get('blocked')} reason={pv.get('block_reason')} counts={json.dumps(pv.get('counts'))}")
        s, b = call(f"/api/admin/opportunities/{ids['opportunity']}/delete", A, "POST", b"{}", "application/json")
        out["lead_delete"] = s
        print(f"lead delete: status={s} code={code_of(b)} ok={(b or {}).get('ok') if isinstance(b, dict) else None}")
        s, b = library(A, "opportunity", ids["opportunity"])
        out["library_after"] = s
        print(f"library after delete: status={s}")
    for k in ("household",):
        if ids.get(k):
            s, b = library(A, "household", ids[k])
            out["household_after"] = s
            print(f"household library after delete: status={s}")
    json.dump(out, open(os.path.join(HERE, f"d4_hosted_reset_results{VTAG}.{RUN}.json"), "w"), indent=2)
    sys.exit(0)

# --------------------------------------------------------------------------------------------------------------- orphans
if PHASE == "orphans":
    A = "fixture_admin"
    out = {}
    for v in ("", "-ui"):
        path = os.path.join(HERE, f"d4_hosted_fixture_ids{v}.{RUN}.json")
        ids = json.load(open(path))
        orphan = ids.get("adult2")
        if not orphan or ids.get("adult2_removed"):
            continue
        tmp = ids.get("orphan_lead")
        if not tmp:
            s, b = j("/api/admin/actions/execute", A, {
                "action_key": "create_lead", "entity_type": "opportunity", "mode": "execute",
                "payload": {"first_name": "QA D47 Orphan Sweep", "last_name": f"{v or '-wu1'} {SUFFIX}", "email": f"qa-d47-{SUFFIX}{v}-sweep@example.com"},
                "context": ({"work_unit_id": WU1, "surface": "work_unit"} if not v else {"surface": "work_unit"}),
            })
            data = (b or {}).get("data") or {} if isinstance(b, dict) else {}
            tmp = data.get("affected_id")
            print(f"sweep lead{v}: status={s} has_opp={bool(tmp)}")
            if not tmp:
                sys.exit(1)
            ids["orphan_lead"] = tmp
            json.dump(ids, open(path, "w"), indent=2)
        s, b = library(A, "opportunity", tmp)
        hh = (((b or {}).get("library") or {}).get("household") or {}).get("id")
        s, b = j("/api/admin/actions/execute", A, {
            "action_key": "link_existing_person", "entity_type": "opportunity", "entity_id": tmp, "mode": "execute",
            "payload": {"customer_id": hh, "source_entity_type": "opportunity", "source_record_id": tmp, "source_opportunity_id": tmp,
                        "scope": "this_opportunity", "selected_person_id": orphan, "role_key": "billing_contact"},
        })
        print(f"link orphan{v}: status={s} ok={(b or {}).get('ok') if isinstance(b, dict) else None} error={json.dumps((b or {}).get('error')) if isinstance(b, dict) else None}")
        s, b = call(f"/api/admin/opportunities/{tmp}/delete-preview", A)
        pv = (b or {}).get("preview") or {} if isinstance(b, dict) else {}
        print(f"preview{v}: blocked={pv.get('blocked')} counts={json.dumps(pv.get('counts'))}")
        s, b = call(f"/api/admin/opportunities/{tmp}/delete", A, "POST", b"{}", "application/json")
        print(f"sweep delete{v}: status={s} ok={(b or {}).get('ok') if isinstance(b, dict) else None}")
        out[v or "wu1"] = {"link": s, "preview_parents": (pv.get("counts") or {}).get("parents"), "delete": s}
        if s == 200:
            ids["adult2_removed"] = True
            json.dump(ids, open(path, "w"), indent=2)
    json.dump(out, open(os.path.join(HERE, f"d4_hosted_orphan_sweep_results.{RUN}.json"), "w"), indent=2)
    sys.exit(0)
