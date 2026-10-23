"""Documents V1 / D1c-1 — hosted structural-screening certification (authz_q1 personas).

Usage: d1c1_hosted_screening_cert.py <qa_run_id> certify|teardown

Real HTTP from each persona's run-scoped session against the deployed build. It covers:
  * a clean PDF stays available;
  * a PDF with JavaScript is quarantined, and is then unreachable everywhere: link, preview, extracted text, lists,
    drawer;
  * the review queue is for reviewers only;
  * release enforces authorization, a reason, cross-organization isolation, audit-first and idempotency;
  * corrupt, mismatched and truncated files are refused and stored nothing, including on the public vendor application.
Never prints a cookie, signed URL, path, title or content. Structural screening is not antivirus, and this run does not
claim any file is malware-free.
"""
import json, os, sys, time, urllib.request, urllib.error, uuid

BASE = "https://staging.workwithalloy.com"
AUTH = os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.path.dirname(os.path.abspath(__file__))
RUN = sys.argv[1]
PHASE = sys.argv[2]
TAG = f"qa-authz-{RUN}"
Q1_IDS = os.path.join(HERE, f"q1_hosted_fixture_ids.{RUN}.json")
STATE_FILE = os.path.join(HERE, f"d1c1_hosted_fixture_ids.{RUN}.json")
OPP1 = "aa000000-0000-4000-8000-000000000111"
_cookies = {}


def cookie(p):
    if p not in _cookies:
        st = json.load(open(os.path.join(AUTH, RUN, p, "storage-state.json")))
        _cookies[p] = "; ".join(f"{c['name']}={c['value']}" for c in st["cookies"] if "workwithalloy" in c.get("domain", ""))
    return _cookies[p]


def call(path, persona=None, method="GET", body=None, ctype=None, headers=None):
    h = {"accept": "application/json"}
    if persona:
        h["cookie"] = cookie(persona)
    if method != "GET":
        h["origin"] = BASE
        h["referer"] = BASE + "/admin"
    if ctype:
        h["content-type"] = ctype
    h.update(headers or {})
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


def code_of(b):
    return b.get("code") if isinstance(b, dict) else None


def tiny_pdf(label):
    text = f"QA authz D1b fixture {label}"
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


PNG_BYTES = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) + b"\x00" * 64


def multipart(fields, filename, content, mime):
    b = "----qaauthzd1b" + uuid.uuid4().hex
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()]
    if filename is not None:
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + content + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={b}"


def upload(persona, key, fields, content, filename_ext, mime):
    body, ct = multipart({**fields, "title": f"{TAG} {key}"}, f"{TAG}-{key}.{filename_ext}", content, mime)
    return call("/api/admin/documents/upload", persona, "POST", body, ct)


results = []


def check(case, persona, ok, status, code=None, **extra):
    results.append({"case": case, "persona": persona, "pass": bool(ok), "status": status, "code": code, **extra})
    print(("PASS " if ok else "FAIL ") + f"[{persona}] {case} :: status={status} code={code}" + (f" {json.dumps(extra)}" if extra else ""))


JS_PDF = (b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\n"
          b"trailer\n<< /Root 1 0 R >>\n%%EOF\n")
TRUNCATED_PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
CORRUPT_PNG = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3])


def doc_of(b):
    return ((b or {}).get("document") or {}).get("id") if isinstance(b, dict) else None


def queue(persona):
    s, b = call("/api/admin/documents/screening", persona)
    return s, {(d or {}).get("id"): d for d in ((b or {}).get("documents") or [])} if isinstance(b, dict) else {}


if PHASE == "certify":
    ids = {}
    s, info = call("/api/build-info")
    check("deployed build", None, s == 200, s, sha=(info or {}).get("gitSha"), project=(info or {}).get("supabaseProjectRef"))
    target = {"entity_type": "opportunity", "entity_id": OPP1, "doc_type": "other"}

    # 1. Positive control: a clean PDF is stored available.
    s, b = upload("fixture_admin", "clean", target, tiny_pdf("clean"), "pdf", "application/pdf")
    clean = doc_of(b)
    raw = (b or {}).get("raw") or {} if isinstance(b, dict) else {}
    check("clean PDF stored available", "fixture_admin", s == 200 and bool(clean) and raw.get("status") == "uploaded"
          and ((raw.get("metadata") or {}).get("screening") or {}).get("verdict") == "clean", s, code_of(b))
    if clean:
        ids["clean"] = clean
        s, b = call(f"/api/admin/documents/{clean}/signed-url", "doc_reader")
        check("clean PDF readable by a reader", "doc_reader", s == 200, s, code_of(b))

    # 2. Unsafe structure is quarantined and unreachable.
    s, b = upload("fixture_admin", "scripted", target, JS_PDF, "pdf", "application/pdf")
    held = doc_of(b)
    scr = (b or {}).get("screening") or {} if isinstance(b, dict) else {}
    check("PDF with JavaScript is quarantined", "fixture_admin", s == 200 and bool(held) and scr.get("verdict") == "quarantine"
          and scr.get("reason") == "active_content" and (b or {}).get("processing_case_id") is None, s, code_of(b), findings=scr.get("findings"))
    if held:
        ids["held"] = held
        json.dump(ids, open(STATE_FILE, "w"), indent=2)
        for p in ("fixture_admin", "doc_reader", "ocr"):
            s, b = call(f"/api/admin/documents/{held}/signed-url", p)
            check("quarantined: no link", p, s == 403 and code_of(b) == "DOCUMENT_RESTRICTED", s, code_of(b))
        s, b = call(f"/api/admin/documents/{held}/source-preview", "doc_reader")
        check("quarantined: no preview", "doc_reader", s in (403, 404), s, code_of(b))
        s, b = call(f"/api/admin/pos/documents/{held}/extracted-text", "ocr")
        check("quarantined: no extracted text", "ocr", s in (403, 404), s, code_of(b))
        for p in ("fixture_admin", "doc_reader"):
            s, b = call("/api/admin/documents?limit=200", p)
            got = {(d or {}).get("id") for d in ((b or {}).get("documents") or [])} if isinstance(b, dict) else set()
            check("quarantined: not in the documents list", p, s == 200 and held not in got and (clean in got), s, code_of(b))
        s, b = call("/api/admin/pos/documents?limit=200", "fixture_admin")
        got = {(d or {}).get("documentId") for d in ((b or {}).get("documents") or [])} if isinstance(b, dict) else set()
        check("quarantined: not in the Processing list", "fixture_admin", s == 200 and held not in got, s, code_of(b))
        s, b = call(f"/api/admin/entity/documents/{held}", "fixture_admin")
        check("quarantined: no drawer", "fixture_admin", s == 404, s, code_of(b))

        # 3. Review queue: reviewers only.
        s, q = queue("fixture_admin")
        check("review queue lists it for a reviewer", "fixture_admin", s == 200 and held in q and clean not in q, s, None,
              screening_reason=((q.get(held) or {}).get("screening") or {}).get("reason"))
        for p in ("doc_reader", "ocr", "processing_only", "no_docs"):
            s, _ = queue(p)
            check("review queue refused to a non-reviewer", p, s == 403, s, None)

        # 4. Release: authorization, reason, cross-org, audit-first, idempotency.
        rel = lambda p, body: call(f"/api/admin/documents/{held}/screening", p, "POST", json.dumps(body).encode(), "application/json")
        s, b = rel("doc_reader", {"action": "release", "reason": "certification probe, reader"})
        check("release refused to a non-reviewer", "doc_reader", s == 403, s, code_of(b))
        s, b = rel("cross_org_admin", {"action": "release", "reason": "certification probe, other org"})
        check("release invisible to another organization", "cross_org_admin", s == 404, s, code_of(b))
        s, b = rel("fixture_admin", {"action": "release"})
        check("release without a reason refused", "fixture_admin", s == 400 and code_of(b) == "REASON_REQUIRED", s, code_of(b))
        s, b = call(f"/api/admin/documents/{held}/signed-url", "doc_reader")
        check("still quarantined after refused releases", "doc_reader", s == 403, s, code_of(b))
        s, b = rel("fixture_admin", {"action": "release", "reason": "D1c-1 hosted certification: reviewed findings (synthetic script)"})
        check("authorized release", "fixture_admin", s == 200 and isinstance(b, dict) and b.get("status") == "uploaded", s, code_of(b))
        s, b = call(f"/api/admin/documents/{held}/signed-url", "doc_reader")
        check("released document is available", "doc_reader", s == 200, s, code_of(b))
        s, b = rel("fixture_admin", {"action": "release", "reason": "D1c-1 hosted certification: second release"})
        check("second release refused (not quarantined)", "fixture_admin", s == 409 and code_of(b) == "NOT_QUARANTINED", s, code_of(b))

    # 5. Refusals store nothing.
    for key, content, ext, mime, want in [
        ("corrupt-png", CORRUPT_PNG, "png", "image/png", "SCREENING_REFUSED"),
        ("png-as-pdf", CORRUPT_PNG, "pdf", "application/pdf", "CONTENT_MISMATCH"),
        ("truncated-pdf", TRUNCATED_PDF, "pdf", "application/pdf", "SCREENING_REFUSED"),
    ]:
        s, b = upload("fixture_admin", key, target, content, ext, mime)
        check(f"refused upload ({key})", "fixture_admin", s == 415 and code_of(b) == want and not doc_of(b), s, code_of(b))
    vendor_fields = {"first_name": "QA", "last_name": "Screening", "email": "qa-screening@example.com", "phone": "5550000000",
                     "consent_contractor_agreement": "true", "consent_legal": "true", "vertical_ids[]": "qa"}
    bnd = "----qad1c1" + uuid.uuid4().hex
    parts = [f'--{bnd}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in vendor_fields.items()]
    for field in ("proof_of_insurance", "drivers_license"):
        parts.append(f'--{bnd}\r\nContent-Disposition: form-data; name="{field}"; filename="{TAG}-{field}.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + CORRUPT_PNG + b"\r\n")
    parts.append(f"--{bnd}--\r\n".encode())
    s, b = call("/api/vendor-application", None, "POST", b"".join(parts), f"multipart/form-data; boundary={bnd}")
    check("public vendor application: corrupt files refused before anything is written", None, s == 415 and code_of(b) == "SCREENING_REFUSED", s, code_of(b))

    summary = {"passed": sum(r["pass"] for r in results), "total": len(results), "qa_run_id": RUN, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    print("\nSUMMARY", json.dumps(summary))
    json.dump({"summary": summary, "results": results}, open(os.path.join(HERE, f"d1c1_hosted_screening_cert_results.{RUN}.json"), "w"), indent=2)
    sys.exit(0 if summary["passed"] == summary["total"] else 1)

if PHASE == "teardown":
    ids = json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {}
    # Anything still quarantined (e.g. a release that did not happen) is found through the review queue.
    s, q = queue("fixture_admin")
    for did, d in q.items():
        if TAG in json.dumps(d) and did not in ids.values():
            ids[f"held_{did[:8]}"] = did
    ok_all = True
    for key, did in ids.items():
        s, b = call(f"/api/admin/pos/documents/{did}", "fixture_admin", "DELETE")
        data = (b or {}).get("data") if isinstance(b, dict) else None
        deleted = isinstance(data, dict) and data.get("deleted") is True
        s2, _ = call(f"/api/admin/documents/{did}/signed-url", "fixture_admin")
        ok_all &= (deleted or s == 404) and s2 == 404
        print(f"delete {key}: status={s} deleted={deleted} after_signed_url={s2}")
    print("TEARDOWN", json.dumps({"ok": bool(ok_all), "count": len(ids)}))
    sys.exit(0 if ok_all else 1)
