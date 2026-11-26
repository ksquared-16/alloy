"""Documents V1 / D2 — hosted canonical-foundation certification (authz_q1 personas).

Usage: d2_hosted_foundation_cert.py <qa_run_id> certify|teardown

Real HTTP from each persona's run-scoped session against the deployed build:
  * versions: listed without a location; a clean replacement becomes version 2 and supersedes version 1; version 1 stays
    retrievable under the same decision; a replacement needs write, a reason and a clean file; another organization and
    another document's version are refused;
  * subjects: the primary owner decides access; a secondary owner or context link to a readable record grants nothing;
    re-filing moves access; another organization's subject is refused;
  * sensitivity: raise-only, the actor's own clearance, a raised class refuses readers who lack it;
  * lifecycle statuses cannot be set through the status PATCH.
Never prints a cookie, signed URL, path, title or content.
"""
import json, os, sys, time, urllib.request, urllib.error, uuid

BASE = "https://staging.workwithalloy.com"
AUTH = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.path.dirname(os.path.abspath(__file__))
RUN = sys.argv[1]
PHASE = sys.argv[2]
TAG = f"qa-authz-{RUN}"
STATE_FILE = os.path.join(HERE, f"d2_hosted_fixture_ids.{RUN}.json")
OPP1 = "aa000000-0000-4000-8000-000000000111"  # QA D1, in scope for scoped_ops
OPP2 = "aa000000-0000-4000-8000-000000000112"  # QA D2, out of scope for scoped_ops
OPPX = "aa000000-0000-4000-8000-000000000211"  # a QA Secondary subject
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


def jpost(path, persona, body, method="POST"):
    return call(path, persona, method, json.dumps(body).encode(), "application/json")


def code_of(b):
    return b.get("code") if isinstance(b, dict) else None


def tiny_pdf(label):
    text = f"QA authz D2 fixture {label}"
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


JS_PDF = (b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\n"
          b"trailer\n<< /Root 1 0 R >>\n%%EOF\n")


def multipart(fields, filename, content, mime):
    b = "----qaauthzd2" + uuid.uuid4().hex
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()]
    if filename is not None:
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + content + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={b}"


def upload(persona, key, opp):
    body, ct = multipart({"entity_type": "opportunity", "entity_id": opp, "doc_type": "other", "title": f"{TAG} {key}"},
                         f"{TAG}-{key}.pdf", tiny_pdf(key), "application/pdf")
    s, b = call("/api/admin/documents/upload", persona, "POST", body, ct)
    return s, ((b or {}).get("document") or {}).get("id") if isinstance(b, dict) else None


def replace(persona, did, key, content, reason):
    fields = {"reason": reason} if reason else {}
    body, ct = multipart(fields, f"{TAG}-{key}.pdf", content, "application/pdf")
    return call(f"/api/admin/documents/{did}/versions", persona, "POST", body, ct)


results = []


def check(case, persona, ok, status, code=None, **extra):
    results.append({"case": case, "persona": persona, "pass": bool(ok), "status": status, "code": code, **extra})
    print(("PASS " if ok else "FAIL ") + f"[{persona}] {case} :: status={status} code={code}" + (f" {json.dumps(extra)}" if extra else ""))


def link(did, persona, version=None):
    return call(f"/api/admin/documents/{did}/signed-url" + (f"?version={version}" if version else ""), persona)


if PHASE == "certify":
    ids = {}
    s, info = call("/api/build-info")
    check("deployed build", None, s == 200, s, sha=(info or {}).get("gitSha"), project=(info or {}).get("supabaseProjectRef"))

    s, a = upload("fixture_admin", "d2a", OPP1)
    check("fixture A uploaded (OPP1)", "fixture_admin", s == 200 and bool(a), s)
    s, bdoc = upload("fixture_admin", "d2b", OPP2)
    check("fixture B uploaded (OPP2)", "fixture_admin", s == 200 and bool(bdoc), s)
    ids.update({"a": a, "b": bdoc})
    json.dump(ids, open(STATE_FILE, "w"), indent=2)

    # ── 1. versions ─────────────────────────────────────────────────────────────────────────────
    s, v = call(f"/api/admin/documents/{a}/versions", "doc_reader")
    vs = (v or {}).get("versions") or [] if isinstance(v, dict) else []
    v1 = vs[0]["id"] if vs else None
    raw = json.dumps(v)
    check("version 1 created by the insert, listed without a location", "doc_reader",
          s == 200 and len(vs) == 1 and vs[0].get("is_current") and vs[0].get("version_number") == 1
          and bool(vs[0].get("checksum_sha256")) and "storage_path" not in raw and "/opportunity/" not in raw, s, code_of(v))
    for p, want in (("no_docs", 403), ("cross_org_admin", 404), ("processing_only", 403)):
        s, b = call(f"/api/admin/documents/{a}/versions", p)
        check("version list refused", p, s == want, s, code_of(b))

    s, b = replace("doc_reader", a, "d2a-v2", tiny_pdf("v2"), "D2 hosted certification replacement")
    check("replacement refused without documents.write", "doc_reader", s == 403, s, code_of(b))
    s, b = replace("fixture_admin", a, "d2a-v2", tiny_pdf("v2"), "")
    check("replacement refused without a reason", "fixture_admin", s == 400 and code_of(b) == "REASON_REQUIRED", s, code_of(b))
    s, b = replace("fixture_admin", a, "d2a-js", JS_PDF, "D2 hosted certification: unsafe replacement")
    check("unsafe replacement refused, nothing stored", "fixture_admin", s == 415 and code_of(b) == "SCREENING_REFUSED", s, code_of(b))
    s, b = replace("cross_org_admin", a, "d2a-x", tiny_pdf("x"), "D2 hosted certification: other organization")
    check("replacement invisible to another organization", "cross_org_admin", s == 404, s, code_of(b))
    s, b = replace("fixture_admin", a, "d2a-v2", tiny_pdf("v2"), "D2 hosted certification: corrected file")
    v2 = (b or {}).get("version_id") if isinstance(b, dict) else None
    check("clean replacement becomes version 2 superseding version 1", "fixture_admin",
          s == 200 and (b or {}).get("version_number") == 2 and (b or {}).get("supersedes_version_id") == v1, s, code_of(b))

    s, v = call(f"/api/admin/documents/{a}/versions", "doc_reader")
    vs = (v or {}).get("versions") or [] if isinstance(v, dict) else []
    cur = [x for x in vs if x.get("is_current")]
    check("two versions; version 2 current; version 1 kept", "doc_reader",
          s == 200 and len(vs) == 2 and len(cur) == 1 and cur[0].get("id") == v2 and any(x.get("id") == v1 for x in vs), s, code_of(v))
    s, b = link(a, "doc_reader", v1)
    check("historical version 1 retrievable", "doc_reader", s == 200 and bool((b or {}).get("signedUrl")), s, code_of(b))
    s, b = link(a, "doc_reader")
    check("current version retrievable", "doc_reader", s == 200, s, code_of(b))
    s, b = link(a, "cross_org_admin", v1)
    check("historical version refused to another organization", "cross_org_admin", s == 404, s, code_of(b))
    s, bv = call(f"/api/admin/documents/{bdoc}/versions", "fixture_admin")
    bv1 = (((bv or {}).get("versions") or [{}])[0]).get("id") if isinstance(bv, dict) else None
    s, b = link(a, "fixture_admin", bv1)
    check("another document's version is never signed through this one", "fixture_admin", s == 404, s, code_of(b))

    # ── 2. subjects ─────────────────────────────────────────────────────────────────────────────
    s, sj = call(f"/api/admin/documents/{a}/subjects", "doc_reader")
    subs = (sj or {}).get("subjects") or [] if isinstance(sj, dict) else []
    prim = [x for x in subs if x.get("is_primary")]
    check("primary owner is the legacy parent", "doc_reader",
          s == 200 and len(prim) == 1 and prim[0].get("subject_type") == "opportunity" and prim[0].get("subject_id") == OPP1, s, code_of(sj))
    s, b = link(a, "scoped_ops")
    check("in-scope reader reads A (primary OPP1)", "scoped_ops", s == 200, s, code_of(b))
    s, b = link(bdoc, "scoped_ops")
    check("out-of-scope reader refused B (primary OPP2)", "scoped_ops", s == 404, s, code_of(b))
    s, b = jpost(f"/api/admin/documents/{bdoc}/subjects", "fixture_admin", {"action": "link", "subject_type": "opportunity", "subject_id": OPP1, "association": "context"})
    check("B linked to OPP1 as context", "fixture_admin", s == 200, s, code_of(b))
    s, b = jpost(f"/api/admin/documents/{bdoc}/subjects", "fixture_admin", {"action": "link", "subject_type": "opportunity", "subject_id": OPP1, "association": "owner"})
    check("B linked to OPP1 again (idempotent)", "fixture_admin", s == 200, s, code_of(b))
    s, b = link(bdoc, "scoped_ops")
    check("a link to a readable record grants nothing", "scoped_ops", s == 404, s, code_of(b))
    s, sj = call(f"/api/admin/documents/{bdoc}/subjects", "fixture_admin")
    subs = (sj or {}).get("subjects") or [] if isinstance(sj, dict) else []
    check("B lists its primary owner and the context link", "fixture_admin",
          s == 200 and any(x.get("is_primary") and x.get("subject_id") == OPP2 for x in subs)
          and any((not x.get("is_primary")) and x.get("subject_id") == OPP1 for x in subs), s, code_of(sj), associations=len(subs))
    s, b = jpost(f"/api/admin/documents/{bdoc}/subjects", "fixture_admin", {"action": "unlink", "subject_type": "opportunity", "subject_id": OPP2})
    check("the primary owner cannot be unlinked", "fixture_admin", s == 409 and code_of(b) == "PRIMARY_REQUIRED", s, code_of(b))
    s, b = jpost(f"/api/admin/documents/{a}/subjects", "fixture_admin", {"action": "set_primary", "subject_type": "opportunity", "subject_id": OPPX})
    check("another organization's subject is refused", "fixture_admin", s == 404, s, code_of(b))
    s, b = jpost(f"/api/admin/documents/{a}/subjects", "doc_reader", {"action": "set_primary", "subject_type": "opportunity", "subject_id": OPP2})
    check("re-filing refused without documents.write", "doc_reader", s == 403, s, code_of(b))
    s, b = jpost(f"/api/admin/documents/{a}/subjects", "fixture_admin", {"action": "set_primary", "subject_type": "opportunity", "subject_id": OPP2})
    check("re-filing A under OPP2", "fixture_admin", s == 200, s, code_of(b))
    s, b = link(a, "scoped_ops")
    check("re-filing moved access: in-scope reader now refused A", "scoped_ops", s == 404, s, code_of(b))
    s, b = jpost(f"/api/admin/documents/{a}/subjects", "fixture_admin", {"action": "set_primary", "subject_type": "opportunity", "subject_id": OPP1})
    check("re-filing A back under OPP1", "fixture_admin", s == 200, s, code_of(b))
    s, b = link(a, "scoped_ops")
    check("access restored with the primary owner", "scoped_ops", s == 200, s, code_of(b))

    # ── 3. sensitivity and lifecycle ────────────────────────────────────────────────────────────
    s, b = jpost(f"/api/admin/documents/{a}/sensitivity", "doc_reader", {"sensitivity": "restricted", "reason": "D2 hosted certification probe"})
    check("raise refused without documents.write", "doc_reader", s == 403, s, code_of(b))
    s, b = jpost(f"/api/admin/documents/{a}/sensitivity", "fixture_admin", {"sensitivity": "restricted", "reason": "D2 hosted certification: restricted class"})
    raised = s == 200 and (b or {}).get("sensitivity") == "restricted"
    check("raise to restricted by a cleared actor (or refused for lack of clearance)", "fixture_admin",
          raised or (s == 403 and code_of(b) == "CLEARANCE_REQUIRED"), s, code_of(b), raised=raised)
    if raised:
        for p in ("doc_reader", "scoped_ops", "ocr"):
            s, b2 = link(a, p)
            check("restricted document refused to a reader without clearance", p, s == 403 and code_of(b2) == "SENSITIVE_DOCUMENT", s, code_of(b2))
        s, b2 = call(f"/api/admin/documents/{a}/versions", "doc_reader")
        check("restricted document's versions refused too", "doc_reader", s == 403, s, code_of(b2))
        s, b2 = link(a, "fixture_admin", v1)
        check("cleared actor still reads every version", "fixture_admin", s == 200, s, code_of(b2))
        s, b2 = jpost(f"/api/admin/documents/{a}/sensitivity", "fixture_admin", {"sensitivity": "medical", "reason": "D2 hosted certification: lowering"})
        check("lowering refused", "fixture_admin", s in (403, 409), s, code_of(b2))
    s, b = jpost(f"/api/admin/documents/{bdoc}", "fixture_admin", {"status_key": "quarantined"}, method="PATCH")
    check("lifecycle status cannot be set through the status PATCH", "fixture_admin", s == 409 and code_of(b) == "LIFECYCLE_STATUS", s, code_of(b))

    summary = {"passed": sum(r["pass"] for r in results), "total": len(results), "qa_run_id": RUN, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    print("\nSUMMARY", json.dumps(summary))
    json.dump({"summary": summary, "results": results}, open(os.path.join(HERE, f"d2_hosted_foundation_cert_results.{RUN}.json"), "w"), indent=2)
    sys.exit(0 if summary["passed"] == summary["total"] else 1)

if PHASE == "teardown":
    ids = json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {}
    ok_all = True
    for key, did in ids.items():
        if not did:
            continue
        s, b = call(f"/api/admin/pos/documents/{did}", "fixture_admin", "DELETE")
        data = (b or {}).get("data") if isinstance(b, dict) else None
        deleted = isinstance(data, dict) and data.get("deleted") is True
        s2, _ = call(f"/api/admin/documents/{did}/signed-url", "fixture_admin")
        ok_all &= (deleted or s == 404) and s2 == 404
        print(f"delete {key}: status={s} deleted={deleted} after_signed_url={s2}")
    print("TEARDOWN", json.dumps({"ok": bool(ok_all), "count": len(ids)}))
    sys.exit(0 if ok_all else 1)
