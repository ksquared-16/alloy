"""Documents V1 / D3 — hosted Document Studio certification (authz_q1 personas).

Usage: d3_hosted_studio_cert.py <qa_run_id> certify|teardown

Real HTTP from each persona's run-scoped session against the deployed build, through the same routes Studio → Documents
calls:
  * reads: the starter vocabulary is visible to document readers, never to a role without documents, and never across
    organizations;
  * writes: only processing.documents.manage changes configuration; ops-style and reader roles are refused;
  * categories: stable key, nesting, cycle refusal, archive refusal while in use, cross-organization isolation;
  * types: draft → validate → publish (compare-and-swap), a stale publish refused, a revision that lowers sensitivity
    refused, stable identity across revisions;
  * enforcement: a new document of a published type takes its default sensitivity; a reader without the clearance is
    refused; a type in use cannot be deleted;
  * the compatibility report counts stored doc_type values.
Every configuration row it creates carries a run-tagged key and leaves through the audited deletes in `teardown`.
Never prints a cookie, signed URL, path, title or content.
"""
import json, os, sys, time, urllib.request, urllib.error, uuid

BASE = "https://staging.workwithalloy.com"
AUTH = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.path.dirname(os.path.abspath(__file__))
RUN = sys.argv[1]
PHASE = sys.argv[2]
TAG = f"qa-authz-{RUN}"
KEYTAG = "qa_" + RUN.split("_", 1)[1]  # qa_<run suffix>, a valid configuration key prefix
STATE_FILE = os.path.join(HERE, f"d3_hosted_fixture_ids.{RUN}.json")
OPP1 = "aa000000-0000-4000-8000-000000000111"
CFG = "/api/admin/documents/configuration"
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
    text = f"QA authz D3 fixture {label}"
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


def upload(persona, key, doc_type):
    b = "----qaauthzd3" + uuid.uuid4().hex
    fields = {"entity_type": "opportunity", "entity_id": OPP1, "doc_type": doc_type, "title": f"{TAG} {key}"}
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()]
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{TAG}-{key}.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode() + tiny_pdf(key) + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    s, body = call("/api/admin/documents/upload", persona, "POST", b"".join(parts), f"multipart/form-data; boundary={b}")
    return s, ((body or {}).get("document") or {}).get("id") if isinstance(body, dict) else None, (((body or {}).get("raw") or {}).get("sensitivity") if isinstance(body, dict) else None)


results = []


def check(case, persona, ok, status, code=None, **extra):
    results.append({"case": case, "persona": persona, "pass": bool(ok), "status": status, "code": code, **extra})
    print(("PASS " if ok else "FAIL ") + f"[{persona}] {case} :: status={status} code={code}" + (f" {json.dumps(extra)}" if extra else ""))


def save_state(ids):
    json.dump(ids, open(STATE_FILE, "w"), indent=2)


DRAFT = {
    "label": "QA permit", "description": "D3 hosted certification fixture", "subject_types": ["child", "household"],
    "allowed_formats": ["pdf", "png"], "default_sensitivity": "personal_identity", "review_required": True,
    "replacement_policy": "new_version", "validity_policy": {"kind": "duration", "value": 12, "unit": "months", "warning_days": [30, 7]},
}

if PHASE == "certify":
    ids = {"categories": [], "types": [], "documents": []}
    s, info = call("/api/build-info")
    check("deployed build", None, s == 200, s, sha=(info or {}).get("gitSha"), project=(info or {}).get("supabaseProjectRef"))

    # ── reads ──────────────────────────────────────────────────────────────────────────────────
    s, c = call(f"{CFG}/categories", "fixture_admin")
    cats = (c or {}).get("categories") or [] if isinstance(c, dict) else []
    s2, t = call(f"{CFG}/types", "fixture_admin")
    types = (t or {}).get("types") or [] if isinstance(t, dict) else []
    keys = {x.get("key") for x in types}
    check("starter vocabulary present (10 categories, 13 types incl. existing doc_type values)", "fixture_admin",
          s == 200 and s2 == 200 and sum(1 for x in cats if x.get("seeded")) >= 10 and {"immunization_record", "generated_form_pdf", "signature_asset", "profile_photo", "insurance", "drivers_license"} <= keys,
          s2, categories=len(cats), types=len(types))
    immun = next((x for x in types if x.get("key") == "immunization_record"), {})
    check("medical type published as medical", "fixture_admin", ((immun.get("published") or {}).get("default_sensitivity")) == "medical", s2)
    check("enforcement is stated, not implied", "fixture_admin", ((t or {}).get("enforcement") or {}).get("validity_policy") == "declared_d7"
          and ((t or {}).get("enforcement") or {}).get("default_sensitivity") == "enforced", s2)
    for p, want in (("doc_reader", 200), ("ocr", 200), ("no_docs", 403)):
        s, _ = call(f"{CFG}/types", p)
        check("configuration read", p, s == want, s)
    shared_ids = {x.get("id") for x in types}
    s, xt = call(f"{CFG}/types", "cross_org_admin")
    xids = {x.get("id") for x in ((xt or {}).get("types") or [])} if isinstance(xt, dict) else set()
    check("another organization sees only its own types", "cross_org_admin", s == 200 and len(xids) >= 13 and not (xids & shared_ids), s)

    # ── writes refused without processing.documents.manage ─────────────────────────────────────
    for p in ("doc_reader", "ocr", "processing_only"):
        s, b = j(f"{CFG}/categories", p, {"label": "QA refused", "key": f"{KEYTAG}_refused"})
        check("category create refused", p, s == 403, s, code_of(b))
        s, b = j(f"{CFG}/types", p, {**DRAFT, "key": f"{KEYTAG}_refused"})
        check("type create refused", p, s == 403, s, code_of(b))

    # ── categories ─────────────────────────────────────────────────────────────────────────────
    s, b = j(f"{CFG}/categories", "fixture_admin", {"label": "QA parent", "key": f"{KEYTAG}_parent"})
    parent = ((b or {}).get("category") or {}).get("id")
    if parent:
        ids["categories"].append(parent); save_state(ids)
    check("category created with the requested stable key", "fixture_admin", s == 200 and ((b or {}).get("category") or {}).get("key") == f"{KEYTAG}_parent", s, code_of(b))
    s, b = j(f"{CFG}/categories", "fixture_admin", {"label": "QA child", "key": f"{KEYTAG}_child", "parent_id": parent})
    child = ((b or {}).get("category") or {}).get("id")
    if child:
        ids["categories"].insert(0, child); save_state(ids)
    check("nested category created", "fixture_admin", s == 200 and ((b or {}).get("category") or {}).get("parent_id") == parent, s, code_of(b))
    s, b = j(f"{CFG}/categories/{parent}", "fixture_admin", {"action": "update", "parent_id": child}, "PATCH")
    check("a cycle is refused", "fixture_admin", s == 409 and code_of(b) == "CATEGORY_CYCLE", s, code_of(b))
    s, b = j(f"{CFG}/categories/{parent}", "fixture_admin", {"action": "archive"}, "PATCH")
    check("archiving a category with an active child is refused", "fixture_admin", s == 409 and code_of(b) == "CATEGORY_HAS_ACTIVE_CHILDREN", s, code_of(b))
    s, b = j(f"{CFG}/categories/{parent}", "fixture_admin", {"action": "update", "label": "QA parent renamed"}, "PATCH")
    check("renaming keeps the key", "fixture_admin", s == 200 and ((b or {}).get("category") or {}).get("key") == f"{KEYTAG}_parent", s, code_of(b))
    s, b = j(f"{CFG}/categories/{parent}", "cross_org_admin", {"action": "archive"}, "PATCH")
    check("another organization cannot change it", "cross_org_admin", s == 404, s, code_of(b))
    s, b = j(f"{CFG}/categories", "fixture_admin", {"label": "QA duplicate", "key": f"{KEYTAG}_parent"})
    check("a duplicate key is refused", "fixture_admin", s == 409 and code_of(b) == "KEY_TAKEN", s, code_of(b))

    # ── types: draft → validate → publish ──────────────────────────────────────────────────────
    tkey = f"{KEYTAG}_permit"
    s, b = j(f"{CFG}/types", "fixture_admin", {**DRAFT, "key": tkey, "category_id": child})
    tid, v1 = (b or {}).get("type_id"), (b or {}).get("version_id")
    if tid:
        ids["types"].append(tid); save_state(ids)
    check("type created as a draft", "fixture_admin", s == 200 and (b or {}).get("status") == "draft" and bool(v1), s, code_of(b))
    s, d = call(f"{CFG}/types/{tid}", "fixture_admin")
    check("nothing is live before publishing", "fixture_admin", s == 200 and (d or {}).get("type", {}).get("published_version_id") is None, s)
    s, b = j(f"{CFG}/types/{tid}/publish", "fixture_admin", {"version_id": v1, "expected_published_version_id": None})
    check("an unvalidated draft cannot be published", "fixture_admin", s == 409 and code_of(b) == "NOT_VALIDATED", s, code_of(b))
    s, b = j(f"{CFG}/types/{tid}/validate", "fixture_admin", {"version_id": v1})
    check("server validation passes", "fixture_admin", s == 200 and (b or {}).get("valid") is True, s, code_of(b))
    s, b = j(f"{CFG}/types/{tid}/publish", "fixture_admin", {"version_id": v1, "expected_published_version_id": v1})
    check("a stale compare-and-swap is refused", "fixture_admin", s == 409 and code_of(b) == "PUBLISH_CONFLICT", s, code_of(b))
    s, b = j(f"{CFG}/types/{tid}/publish", "fixture_admin", {"version_id": v1, "expected_published_version_id": None})
    check("version 1 published", "fixture_admin", s == 200 and (b or {}).get("version_number") == 1, s, code_of(b))
    s, b = j(f"{CFG}/types/{tid}/draft", "fixture_admin", {**DRAFT, "category_id": child, "default_sensitivity": "standard"}, "PUT")
    v2 = (b or {}).get("version_id")
    check("editing opens revision 2; lowering is flagged", "fixture_admin",
          s == 200 and (b or {}).get("version_number") == 2 and any(p.get("code") == "sensitivity_lowering" for p in (b or {}).get("problems") or []), s, code_of(b))
    s, b = j(f"{CFG}/types/{tid}/validate", "fixture_admin", {"version_id": v2})
    check("the server refuses to validate a lowering", "fixture_admin", s == 200 and (b or {}).get("valid") is False
          and any(p.get("code") == "sensitivity_lowering" for p in (b or {}).get("problems") or []), s, code_of(b))
    s, b = j(f"{CFG}/types/{tid}/draft", "fixture_admin", {**DRAFT, "label": "QA permit (revised)", "category_id": child, "default_sensitivity": "restricted"}, "PUT")
    s, b = j(f"{CFG}/types/{tid}/validate", "fixture_admin", {"version_id": v2})
    check("raising to restricted validates", "fixture_admin", s == 200 and (b or {}).get("valid") is True, s, code_of(b))
    s, b = j(f"{CFG}/types/{tid}/publish", "fixture_admin", {"version_id": v2, "expected_published_version_id": v1})
    check("version 2 supersedes version 1", "fixture_admin", s == 200 and (b or {}).get("version_number") == 2 and (b or {}).get("superseded_version_id") == v1, s, code_of(b))
    s, d = call(f"{CFG}/types/{tid}", "doc_reader")
    vs = (d or {}).get("versions") or [] if isinstance(d, dict) else []
    check("identity stable across revisions; v1 superseded, v2 published", "doc_reader",
          s == 200 and (d or {}).get("type", {}).get("key") == tkey and {(v.get("version_number"), v.get("status")) for v in vs} == {(1, "superseded"), (2, "published")}, s)
    s, b = j(f"{CFG}/types/{tid}/draft", "cross_org_admin", {**DRAFT, "category_id": child}, "PUT")
    check("another organization cannot draft it", "cross_org_admin", s == 404, s, code_of(b))

    # ── enforcement: the published default applies to a NEW document ───────────────────────────
    s, did, sens = upload("fixture_admin", "d3-typed", tkey)
    if did:
        ids["documents"].append(did); save_state(ids)
    check("a new document of the type is stored", "fixture_admin", s == 200 and bool(did), s)
    s, b = call(f"/api/admin/documents/{did}/signed-url", "doc_reader")
    check("it carries the type's restricted default: a reader is refused", "doc_reader", s == 403 and code_of(b) == "SENSITIVE_DOCUMENT", s, code_of(b))
    s, b = call(f"/api/admin/documents/{did}/signed-url", "fixture_admin")
    check("a cleared administrator reads it", "fixture_admin", s == 200, s, code_of(b))
    s, b = call(f"{CFG}/types/{tid}", "fixture_admin", "DELETE")
    check("a type in use cannot be deleted", "fixture_admin", s == 409 and code_of(b) == "TYPE_IN_USE", s, code_of(b))
    s, b = j(f"{CFG}/categories/{child}", "fixture_admin", {"action": "archive"}, "PATCH")
    check("a category with an active type cannot be archived", "fixture_admin", s == 409 and code_of(b) == "CATEGORY_IN_USE", s, code_of(b))
    s, b = j(f"{CFG}/types/{tid}", "fixture_admin", {"action": "archive"}, "PATCH")
    check("the type archives", "fixture_admin", s == 200 and (b or {}).get("status") == "archived", s, code_of(b))
    s, b = call(f"{CFG}/compatibility", "doc_reader")
    row = next((r for r in ((b or {}).get("doc_types") or []) if r.get("doc_type") == tkey), None) if isinstance(b, dict) else None
    check("the compatibility report maps the stored value to the type", "doc_reader", s == 200 and bool(row) and row.get("type_id") == tid and row.get("documents") == 1, s)

    summary = {"passed": sum(r["pass"] for r in results), "total": len(results), "qa_run_id": RUN, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    print("\nSUMMARY", json.dumps(summary))
    json.dump({"summary": summary, "results": results}, open(os.path.join(HERE, f"d3_hosted_studio_cert_results.{RUN}.json"), "w"), indent=2)
    sys.exit(0 if summary["passed"] == summary["total"] else 1)

if PHASE == "teardown":
    ids = json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {"categories": [], "types": [], "documents": []}
    ok_all = True
    for did in ids.get("documents", []):
        s, b = call(f"/api/admin/pos/documents/{did}", "fixture_admin", "DELETE")
        s2, _ = call(f"/api/admin/documents/{did}/signed-url", "fixture_admin")
        ok_all &= s2 == 404
        print(f"delete document: status={s} after_signed_url={s2}")
    for tid in ids.get("types", []):
        s, b = call(f"{CFG}/types/{tid}", "fixture_admin", "DELETE")
        s2, _ = call(f"{CFG}/types/{tid}", "fixture_admin")
        ok_all &= s2 == 404
        print(f"delete type: status={s} code={code_of(b)} after={s2}")
    for cid in ids.get("categories", []):
        s, b = call(f"{CFG}/categories/{cid}", "fixture_admin", "DELETE")
        ok_all &= s == 200 or (s == 404 and code_of(b) == "NOT_FOUND")
        print(f"delete category: status={s} code={code_of(b)}")
    s, c = call(f"{CFG}/categories", "fixture_admin")
    s2, t = call(f"{CFG}/types", "fixture_admin")
    left = [x for x in ((c or {}).get("categories") or []) + ((t or {}).get("types") or []) if str(x.get("key", "")).startswith(KEYTAG)]
    ok_all &= not left
    print("TEARDOWN", json.dumps({"ok": bool(ok_all), "remaining_tagged_configuration": len(left)}))
    sys.exit(0 if ok_all else 1)
