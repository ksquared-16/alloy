"""Documents D9.2 / D9.3 (D9-H2) — hosted /api/v1 WRITE, review and lifecycle proof: the consumer driver of a future
D9 write QA plan. Nothing in the toolkit registers or pins it yet; it runs only inside an approved hosted QA run.

Usage: d9_hosted_write_cert.py <qa_run_id> preflight|install|docs|certify|cleanup

Contract: D9-2-3-HOSTED-QA-PLAN.md (§2.2 tokens, §4 matrix W-S1 … W-C1). It runs as the run's fixture_admin (QA Shared)
and cross_org_admin (QA Secondary) sessions, after qa_d9_external_fixture_ensure (C1 @ QA North, C2 @ QA South, H1, CB).

  preflight  reads only: served SHA contains D9.2/D9.3; /api/v1/openapi lists submitDocumentReview; the read, write,
             review and write-scope applications are active and installed in neither org.
  install    creates the five installations (T_W, T_WB, T_WL, T_R, T_A) and records their ids. T_W also gets ONE
             credential, left active and never written anywhere (its secret is dropped at once): qa_d9_aged_upload_ensure
             resolves T_W as the one live write installation in QA Shared with exactly one active credential, and late
             filing (W-ES) is accepted only from the installation that received the upload. If any step fails, install
             disconnects what it created. Run order: preflight → install → qa_d9_aged_upload_ensure → docs → certify.
  docs       uploads the one staff document W-F4 needs (a document no installation received).
  certify    uses the recorded installations (or creates them if install did not run), issues one credential each and
             exchanges it for a token at once, runs the matrix, then ALWAYS revokes every credential recorded (install's
             included) and disconnects every installation, pass or stop. Every case is recorded with its request,
             status, code and body sha256.
  cleanup    idempotent: closes any remaining installation of the four applications, deletes every document this run
             recorded through the audited staff delete, and lists what it could not prove gone.

Run order: d9-hosted/D9-H2-HOSTED-RUN-ORDER.md §3 — certify (step 6), the W-C1 write census d9w-write-audit-census.sql
(step 7, which must read the run's documents before cleanup deletes them), cleanup (step 8), qa_d9_write_fixture_reset
(step 9). Zero residue is the residue census's verdict, not this driver's: e7e8d3d1 already carries d9w_zr_tagged_documents / _objects / _active_installations / _active_credentials /
_escalation_cases.

SECRET-BLIND, as d9_hosted_read_cert.py: client secrets, access tokens and upload ids are held in memory only; every line
printed and every file written passes through emit(), which stops the run (exit 3) rather than write one.

VERDICT. PASS needs every executed case to pass and no stop. W-ES is `not_run` (verdict INCOMPLETE) unless the aged-upload
fixture file exists; W-C1 is always `deferred` to the census and never counted as a pass here.

DISCREPANCIES — the contract's text against the code staging serves (5db26b46). The served code decides; the contract
bytes are not edited.
  0. Run order (D9-H2-HOSTED-RUN-ORDER.md, draft at 6ddad4daa) asks for an install step that keeps T_W live across the
     aged-upload ensure; this driver's `install` is that step. Secrets are never kept on disk, so certify issues fresh
     credentials and T_W briefly holds two active credentials (issueCredential does not revoke earlier ones).
  1. Paths: the contract names operations; the routes are /api/v1/document-uploads, /document-uploads/content?upload_id=,
     /document-filings, /document-subjects, /document-subjects/unlink, /document-validity, /document-versions,
     /document-reviews, /document-archives, /document-requirements. Write responses are the result object itself, not
     {"data": …} (externalOperationRoute); reads keep the {"data": …} envelope.
  2. W-U1: createDocumentUpload is stateless (201 every time; the same Idempotency-Key maps to the same upload uuid). The
     201-then-200 replay is the content step's (completeDocumentUpload), and is what this driver checks.
  3. W-U2: "same key, different bytes" splits in two. A second create under the same key declaring other bytes, then
     its content, is 409 idempotency_conflict. Other bytes sent to the ORIGINAL upload_id are 422 checksum_mismatch.
     Both are checked.
  4. W-U3: a declared byte_size over 4 MiB is 413 FILE_TOO_LARGE at create; an actual body over 4 MiB is 413
     payload_too_large at content (operationRoute). Both carry "4 MiB (4,194,304 bytes)".
  5. W-F3: a medical type is 422 TYPE_NOT_AVAILABLE_EXTERNALLY (sensitivity refusal), not a 404. Another org's child and
     an out-of-boundary child are 404 NOT_FOUND.
  6. W-L1: link and unlink answer 200 (never 201); the linked subject reads role "related", not "context".
  7. W-V1: the first change is 201 changed:true and the repeat 200 changed:false (the contract says 200, then unchanged).
     The inverted range is 400 VALIDITY_RANGE_INVERTED.
  8. W-F1 "history names the application, not a person": neither GET /api/v1/documents/{id}/history nor the staff history
     carries an actor. The driver checks that no person appears; that the actor is the application is checked through
     GET /api/v1/documents/{id}/reviews (actor_kind "application", W-RV1) and is otherwise the census's (W-C1).
  9. W-AR2 "document_restored audited": the staff history has no restore entry, so the audit row is the census's (W-C1).
     The driver checks 200, the previous status and that T_A lists the document again.
 10. W-ES: the escalation is the staging wake's (an external scheduler; the lane cannot trigger it). certify polls the
     Processing documents queue for up to D9W_ES_WAIT_S (default 900 s). No case in that time is `not_run` (the clock
     may be idle), never a product failure; more than one case is a failure. The plan's "a second wake adds nothing" needs
     wake evidence (scheduled_work_clock, read by census), so the driver records it `not_run`. Late filing needs the
     installation that RECEIVED the aged upload, i.e. install's T_W; if the ensure result names another installation,
     late filing is `not_run`. The aged upload has no storage object; a new_document filing copies no bytes.
 11. §5 says "4 installations"; §2.2 lists five tokens (T_A is the read application's). This driver installs all five.

DOCUMENTS THE STAFF DELETE REFUSES: the staff delete (/api/admin/pos/documents/{id}) answers 404 for a document the staff
caller cannot read — an unfiled or quarantined API upload, a superseded replacement upload — and 409 for one whose
Processing case is completed (W-ES). Such documents are listed as `remaining` with the reason (verdict RESIDUE); the
run order's step 9, qa_d9_write_fixture_reset, removes them with their rows and stored objects.
"""
import datetime, hashlib, json, os, re, subprocess, sys, time, urllib.error, urllib.parse, urllib.request, uuid

STAGING = "https://staging.workwithalloy.com"
_override = os.environ.get("D9_BASE_URL", "")
LOCAL = bool(re.fullmatch(r"http://127\.0\.0\.1:\d+", _override))
if _override and not LOCAL:
    sys.exit(f"refused: D9_BASE_URL may only be a loopback test server, not {_override}")
BASE = _override if LOCAL else STAGING
AUTH = os.environ["D9_AUTH_DIR"] if LOCAL and os.environ.get("D9_AUTH_DIR") else os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.environ["D9_OUT_DIR"] if LOCAL and os.environ.get("D9_OUT_DIR") else os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if len(sys.argv) != 3 or not re.fullmatch(r"qar_[0-9a-f]{12}", sys.argv[1]) or sys.argv[2] not in ("preflight", "install", "docs", "certify", "cleanup"):
    sys.exit(__doc__.split("\n\n")[1])
RUN, PHASE = sys.argv[1], sys.argv[2]
TAG = f"qa-d9w-{RUN}"
D93_SHA = "6b3c80f8f"  # D9.3 lifecycle (the D9.2 writes precede it); merged at staging in PR #1630
APPS = {"read": "d9-documents-read-cert", "write": "d9-documents-write-cert", "review": "d9-documents-review-cert",
        "wscope": "d9-documents-write-scope-cert"}
NEVER = "alloy-cert-sandbox"
A, B = "fixture_admin", "cross_org_admin"
QA_NORTH = "21c9be10-f6e9-4048-ab4c-939ddbe0f0b7"
H1 = "d9000000-0000-4000-8000-000000000101"
C1, C2, CB = "d9000000-0000-4000-8000-000000000121", "d9000000-0000-4000-8000-000000000122", "d9000000-0000-4000-8000-000000000221"
STANDARD_TYPE = "enrollment_document"  # seeded: standard, no review, child/household, pdf, replacement new_version
LATE_TYPE = "generated_form_pdf"       # seeded: standard, no review, child, pdf (W-ES files to C1, which already holds STANDARD_TYPE)
MEDICAL_TYPE = "immunization_record"   # seeded: medical
TOKENS = {  # §2.2
    "T_W": {"app": "write", "persona": A, "scopes": ["documents.write"], "boundary": "org_wide"},
    "T_WB": {"app": "write", "persona": B, "scopes": ["documents.write"], "boundary": "org_wide"},
    "T_WL": {"app": "wscope", "persona": A, "scopes": ["documents.write"], "boundary": "locations", "locations": [QA_NORTH]},
    "T_R": {"app": "review", "persona": A, "scopes": ["documents.review"], "boundary": "org_wide"},
    "T_A": {"app": "read", "persona": A, "scopes": ["documents.read"], "boundary": "org_wide"},
}
WRITE_OPS = ["/document-uploads", "/document-uploads/content?upload_id=x", "/document-filings", "/document-subjects",
             "/document-subjects/unlink", "/document-validity", "/document-versions", "/document-reviews", "/document-archives"]
MAX_BYTES = 4 * 1024 * 1024
LIMIT_TEXT = "4 MiB"
IDS_FILE = os.path.join(HERE, f"d9w_hosted_fixture_ids.{RUN}.json")
PREFLIGHT_FILE = os.path.join(HERE, f"d9w_hosted_preflight.{RUN}.json")
RESULTS_FILE = os.path.join(HERE, f"d9w_hosted_results.{RUN}.json")
RESET_FILE = os.path.join(HERE, f"d9w_hosted_reset_results.{RUN}.json")
AGED_FILE = os.path.join(HERE, f"d9w_hosted_aged_upload.{RUN}.json")  # the qa_d9_aged_upload_ensure result, recorded by Documents
AGED_ID = "d9000000-0000-4000-8000-000000000301"  # qa_d9_aged_upload_ensure.sql's fixed id
ES_WAIT_S = int(os.environ.get("D9W_ES_WAIT_S", "900")) if LOCAL else 900
ES_POLL_S = float(os.environ.get("D9W_ES_POLL_S", "30")) if LOCAL else 30.0
PERSON_MARKERS = ("qa-shared-actor", "qa-secondary-admin", "@example.com")
JS_PDF = (b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\n"
          b"trailer\n<< /Root 1 0 R >>\n%%EOF\n")

_secrets = set()
_cookies = {}


def now():
    return datetime.datetime.now(datetime.timezone.utc)


def emit(obj=None, path=None, line=None):
    """The only way out of this process. Refuses to print or write a held secret."""
    text = line if line is not None else json.dumps(obj, indent=2, sort_keys=True)
    if any(s and s in text for s in _secrets):
        sys.stderr.write("SECURITY STOP: output would contain a secret; nothing written\n")
        sys.exit(3)
    if path:
        with open(path, "w") as f:
            f.write(text + "\n")
    else:
        print(text, flush=True)


def load(path):
    return json.load(open(path)) if os.path.exists(path) else {}


def cookie(p):
    if p not in _cookies:
        st = json.load(open(os.path.join(AUTH, RUN, p, "storage-state.json")))
        host = urllib.parse.urlparse(BASE).hostname
        _cookies[p] = "; ".join(f"{c['name']}={c['value']}" for c in st["cookies"] if host.endswith(c.get("domain", "").lstrip(".")))
        _secrets.update(c["value"] for c in st["cookies"] if len(c.get("value", "")) >= 16)
    return _cookies[p]


def call(path, persona=None, method="GET", body=None, ctype=None, bearer=None, key=None):
    h = {"accept": "application/json"}
    if persona:
        h["cookie"] = cookie(persona)
    if bearer:
        h["authorization"] = f"Bearer {bearer}"
    if key:
        h["idempotency-key"] = key
    if method != "GET" and persona:
        h["origin"] = BASE
        h["referer"] = BASE + "/admin"
    if ctype:
        h["content-type"] = ctype
    req = urllib.request.Request(BASE + path, method=method, headers=h, data=body)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            raw, status, headers = r.read(), r.status, dict(r.headers)
    except urllib.error.HTTPError as e:
        raw, status, headers = e.read(), e.code, dict(e.headers)
    except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
        # A transport failure is status 0: it can never satisfy a case, and is recorded, not raised.
        return 0, {"_transport_error": type(e).__name__}, b"", {}
    try:
        b = json.loads(raw or b"null")
    except Exception:
        b = {"_non_json_bytes": len(raw)}
    return status, b, raw, {k.lower(): v for k, v in headers.items()}


def j(path, persona, body, method="POST"):
    return call(path, persona, method, json.dumps(body).encode(), "application/json")


def err(b):
    e = b.get("error") if isinstance(b, dict) else None
    return e if isinstance(e, dict) else {"code": b.get("code") if isinstance(b, dict) else None}


def one(b):
    """The read envelope {"data": {...}}; anything else reads as empty and fails the case that relied on it."""
    d = b.get("data") if isinstance(b, dict) else None
    return d if isinstance(d, dict) else {}


def res(b):
    """A write operation's result: the bare object (externalOperationRoute answers outcome.result)."""
    return b if isinstance(b, dict) and "error" not in b else {}


def tiny_pdf(label):
    text = f"QA D9 write fixture {label}"
    stream = f"BT /F1 10 Tf 10 50 Td ({text}) Tj ET"
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out, offs = "%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n"
    x = len(out)
    out += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offs)
    return (out + f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n").encode()


def multipart(fields, filename, content):
    b = "----qad9w" + uuid.uuid4().hex
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()]
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: application/pdf\r\n\r\n'.encode()
                 + content + b"\r\n")
    return b"".join(parts) + f"--{b}--\r\n".encode(), f"multipart/form-data; boundary={b}"


def applications(persona):
    s, b, _, _ = call("/api/admin/integrations/applications", persona)
    return s, {a["slug"]: a for a in (b or {}).get("applications", [])} if s == 200 else {}


def installations(persona):
    s, b, _, _ = call("/api/admin/integrations/installations", persona)
    return s, [i for i in (b or {}).get("installations", []) if i.get("applicationSlug") in APPS.values()] if s == 200 else []


# ── preflight: reads only ────────────────────────────────────────────────────────────────────────────────────────
def preflight():
    out = {"qa_run_id": RUN, "at": now().isoformat(), "checks": {}}
    s, b, _, _ = call("/api/build-info")
    sha = str((b or {}).get("gitSha") or "")
    has = bool(re.fullmatch(r"[0-9a-f]{7,40}", sha)) and subprocess.run(
        ["git", "-C", REPO, "merge-base", "--is-ancestor", D93_SHA, sha], capture_output=True).returncode == 0
    out["checks"]["served_sha_contains_d9_3"] = {"ok": has, "served": sha, "requires": D93_SHA}
    s, b, raw, _ = call("/api/v1/openapi")
    out["checks"]["openapi_lists_submitDocumentReview"] = {"ok": s == 200 and b"submitDocumentReview" in (raw or b""), "status": s}
    for p in (A, B):
        s, apps = applications(p)
        for slug in APPS.values():
            a = apps.get(slug) or {}
            good = s == 200 and a.get("status") == "active" and a.get("alreadyInstalled") is False
            out["checks"][f"{p}:{slug}"] = {"ok": good, "status": s, "id": a.get("id"), "already_installed": a.get("alreadyInstalled")}
    ok = all(c["ok"] for c in out["checks"].values())
    out["verdict"] = "READY" if ok else "STOP"
    emit(out, PREFLIGHT_FILE)
    emit(line=f"preflight {out['verdict']}: " + ", ".join(f"{k}={'ok' if v['ok'] else 'NO'}" for k, v in out["checks"].items()))
    return 0 if ok else 1


# ── installations and credentials ────────────────────────────────────────────────────────────────────────────────
def create_installation(ids, t):
    """Install one token's application; record the id at once, so a later failure still closes it."""
    spec = TOKENS[t]
    _, apps = applications(spec["persona"])
    app = apps.get(APPS[spec["app"]]) or {}
    if not app.get("id") or app.get("slug") == NEVER:
        raise RuntimeError(f"{t}: application {APPS[spec['app']]} not available")
    body = {"applicationId": app["id"], "grantedScopes": spec["scopes"], "boundaryMode": spec["boundary"]}
    if spec["boundary"] == "locations":
        body["locationIds"] = spec["locations"]
    s, b, _, _ = j("/api/admin/integrations/installations", spec["persona"], body)
    iid = (b or {}).get("installationId")
    if s != 201 or not iid:
        raise RuntimeError(f"{t}: installation refused status={s} code={err(b).get('code')}")
    ids.setdefault("installations", {})[t] = {"installation_id": iid, "persona": spec["persona"], "credential_ids": []}
    emit(ids, IDS_FILE)
    return iid


def issue_credential(ids, t, label):
    """One credential on the recorded installation. Returns (client_id, secret); the secret is never written."""
    inst = ids["installations"][t]
    s, b, _, _ = j(f"/api/admin/integrations/installations/{inst['installation_id']}/credentials", inst["persona"], {"label": f"{TAG} {t} {label}"})
    secret, client_id = (b or {}).get("clientSecret"), (b or {}).get("clientId")
    if secret:
        _secrets.add(secret)
    if s != 201 or not secret:
        raise RuntimeError(f"{t}: credential refused status={s}")
    inst["credential_ids"].append(b.get("credentialId"))
    emit(ids, IDS_FILE)
    return client_id, secret


def issue_token(ids, t):
    client_id, secret = issue_credential(ids, t, "certify")
    s, b, _, _ = j("/api/v1/oauth/token", None, {"grant_type": "client_credentials", "client_id": client_id, "client_secret": secret})
    secret = None
    access = (b or {}).get("access_token")
    if access:
        _secrets.add(access)
    if s != 200 or not access:
        raise RuntimeError(f"{t}: token refused status={s} code={err(b).get('code')}")
    ids["installations"][t]["token_exp"] = (now() + datetime.timedelta(seconds=int(b.get("expires_in") or 0))).isoformat()
    emit(ids, IDS_FILE)
    return access


# ── install: before qa_d9_aged_upload_ensure ─────────────────────────────────────────────────────────────────────
def install():
    if load(PREFLIGHT_FILE).get("verdict") != "READY":
        emit(line="install refused: preflight is not READY")
        return 1
    ids = load(IDS_FILE)
    if ids.get("installations"):
        emit(line="install refused: installations are already recorded for this run (run cleanup first)")
        return 1
    try:
        for t in TOKENS:
            create_installation(ids, t)
        _, secret = issue_credential(ids, "T_W", "install")  # the one active credential the aged-upload ensure requires
        secret = None
    except RuntimeError as e:
        closed = revoke_and_disconnect(ids)
        emit(line=f"install STOP: {e}; closed what it created: all_closed={closed['all_closed']}")
        return 1
    emit(line="install READY: " + ", ".join(f"{t}={v['installation_id']}" for t, v in ids["installations"].items())
         + "; T_W holds one active credential (secret not kept)")
    return 0


# ── docs: the staff upload W-F4 needs ────────────────────────────────────────────────────────────────────────────
def docs():
    if load(PREFLIGHT_FILE).get("verdict") != "READY":
        emit(line="docs refused: preflight is not READY")
        return 1
    ids = load(IDS_FILE)
    ids.setdefault("documents", {})
    if "D_STAFF" not in ids["documents"]:
        body, ct = multipart({"entity_type": "customer_member", "entity_id": C1, "doc_type": "other", "title": f"{TAG} D_STAFF"},
                             f"{TAG}-D_STAFF.pdf", tiny_pdf("D_STAFF"))
        s, b, _, _ = call("/api/admin/documents/upload", A, "POST", body, ct)
        did = ((b or {}).get("document") or {}).get("id") if isinstance(b, dict) else None
        emit(line=f"upload D_STAFF as {A}: status={s} code={err(b).get('code')} has_id={bool(did)}")
        if not did:
            return 1
        ids["documents"]["D_STAFF"] = {"id": did, "owner": A, "via": "staff"}
        emit(ids, IDS_FILE)
    return 0


# ── certify ──────────────────────────────────────────────────────────────────────────────────────────────────────
def certify():
    ids = load(IDS_FILE)
    staff = (ids.get("documents") or {}).get("D_STAFF", {}).get("id")
    if not staff or load(PREFLIGHT_FILE).get("verdict") != "READY":
        emit(line="certify refused: preflight not READY or the staff document is not recorded")
        return 1
    ids.setdefault("installations", {})
    ids.setdefault("documents", {})
    cases, stop, tok = [], None, {}
    today = now().date()
    eff, exp = today.isoformat(), (today + datetime.timedelta(days=30)).isoformat()

    def case(n, name, persona, req, s, b, raw, ok, **extra):
        cases.append({"case": n, "name": name, "as": persona, "request": req, "status": s, "code": err(b).get("code"),
                      "type": err(b).get("type"), "body_sha256": hashlib.sha256(raw or b"").hexdigest(), "pass": bool(ok), **extra})

    def skipped(n, name, outcome, why):
        cases.append({"case": n, "name": name, "as": None, "request": None, "status": None, "code": None, "type": None,
                      "body_sha256": None, "pass": None, "outcome": outcome, "why": why})

    def record_doc(key, did, owner, via="api"):
        ids["documents"][key] = {"id": did, "owner": owner, "via": via}
        emit(ids, IDS_FILE)  # at once, so cleanup finds it even if a later step stops

    def refused_stop(label, s):
        nonlocal stop
        if 200 <= s < 300:
            stop = stop or f"security stop: {label} answered {s} on a refused case"

    try:
        for t in TOKENS:
            if t not in ids["installations"]:
                create_installation(ids, t)
            tok[t] = issue_token(ids, t)

        def v1(t, path, body=None, key=None, ctype="application/json"):
            if body is None:
                return call(f"/api/v1{path}", bearer=tok[t])
            data = body if isinstance(body, bytes) else json.dumps(body).encode()
            return call(f"/api/v1{path}", method="POST", body=data, ctype=ctype, bearer=tok[t], key=key)

        def k(label):
            return f"{TAG}-{label}"

        def create(t, filename, content, key, declared=None):
            s, b, raw, _ = v1(t, "/document-uploads", {"filename": filename, "mime_type": "application/pdf",
                                                       "byte_size": len(content) if declared is None else declared,
                                                       "sha256": hashlib.sha256(content).hexdigest()}, key)
            up = res(b).get("upload_id")
            if up:
                _secrets.add(up)
            return s, b, raw, up

        def content(t, up, data):
            return v1(t, f"/document-uploads/content?upload_id={urllib.parse.quote(up or '', safe='')}", data, key=None, ctype="application/pdf")

        def upload(t, label, data):
            """create + content; returns the document id (recorded at once) or raises."""
            s, b, _, up = create(t, f"{TAG}-{label}.pdf", data, k(label))
            if s != 201 or not up:
                raise RuntimeError(f"{label}: create refused status={s} code={err(b).get('code')}")
            s, b, _, _ = content(t, up, data)
            did = res(b).get("document_id")
            if s not in (200, 201) or not did:
                raise RuntimeError(f"{label}: content refused status={s} code={err(b).get('code')}")
            record_doc(label, did, TOKENS[t]["persona"])
            return did, res(b)

        def file_(t, did, subject_type, subject_id, type_key, key):
            return v1(t, "/document-filings", {"document_id": did, "type_key": type_key,
                                               "primary": {"subject_type": subject_type, "subject_id": subject_id}}, key)

        def listed(t, q):
            got, cursor, pages = [], None, 0
            while pages < 20:
                s, b, raw, _ = v1(t, f"/documents?{q}" + (f"&cursor={urllib.parse.quote(cursor)}" if cursor else ""))
                if s != 200:
                    return s, b, raw, got
                got += [x["id"] for x in b.get("data", [])]
                cursor, pages = b.get("next_cursor"), pages + 1
                if not cursor:
                    return s, b, raw, got
            return 0, {}, b"", got

        def detail(did):
            s, b, raw, _ = v1("T_A", f"/documents/{did}")
            return s, b, raw, one(b)

        def no_person(raw):
            text = (raw or b"").decode(errors="replace").lower()
            return not any(m in text for m in PERSON_MARKERS)

        # ── W-S1: scope before any effect ─────────────────────────────────────────────────────────────────────────
        for op in WRITE_OPS:
            body = b"x" if "content" in op else {}
            s, b, raw, _ = v1("T_A", op, body, key=k("ws1-read"), ctype="application/pdf" if "content" in op else "application/json")
            refused_stop(f"T_A {op}", s)
            case("W-S1", "read token refused on every write operation", "T_A", op, s, b, raw, s == 403 and err(b).get("code") == "forbidden_scope")
        s, b, raw, _ = v1("T_W", "/document-reviews", {}, key=k("ws1-write"))
        refused_stop("T_W review", s)
        case("W-S1", "write token refused on review", "T_W", "/document-reviews", s, b, raw, s == 403 and err(b).get("code") == "forbidden_scope")
        s, b, raw, _ = v1("T_R", "/document-uploads", {}, key=k("ws1-review"))
        refused_stop("T_R upload", s)
        case("W-S1", "review token refused on upload", "T_R", "/document-uploads", s, b, raw, s == 403 and err(b).get("code") == "forbidden_scope")

        # ── W-U1: upload, then its retry converges ───────────────────────────────────────────────────────────────
        u1 = tiny_pdf("U1")
        s, b, raw, up1 = create("T_W", f"{TAG}-U1.pdf", u1, k("U1"))
        case("W-U1", "create upload", "T_W", "U1 create", s, b, raw, s == 201 and bool(up1) and res(b).get("max_bytes") == MAX_BYTES
             and res(b).get("content_url") == "/api/v1/document-uploads/content")
        s, b, raw, _ = content("T_W", up1, u1)
        d_u1 = res(b).get("document_id")
        if d_u1:
            record_doc("U1", d_u1, A)
        case("W-U1", "send bytes", "T_W", "U1 content", s, b, raw, s == 201 and bool(d_u1) and res(b).get("replay") is False and res(b).get("status") == "received")
        s, b, raw, _ = content("T_W", up1, u1)
        case("W-U1", "same bytes again replay", "T_W", "U1 content retry", s, b, raw, s == 200 and res(b).get("replay") is True and res(b).get("document_id") == d_u1)
        s, b, raw, up1b = create("T_W", f"{TAG}-U1.pdf", u1, k("U1"))
        s2, b2, raw2, _ = content("T_W", up1b, u1)
        case("W-U1", "same Idempotency-Key re-created converges on one document", "T_W", "U1 create+content again", s2, b2, raw2,
             s == 201 and s2 == 200 and res(b2).get("replay") is True and res(b2).get("document_id") == d_u1)
        if not d_u1:
            raise RuntimeError("W-U1: no document; the filing cases need it")

        # ── W-U2: same key, different bytes ──────────────────────────────────────────────────────────────────────
        other = tiny_pdf("U1-other")
        s, b, raw, up_other = create("T_W", f"{TAG}-U1.pdf", other, k("U1"))
        s2, b2, raw2, _ = content("T_W", up_other, other)
        case("W-U2", "same key, other bytes: idempotency_conflict", "T_W", "U1 key, other bytes", s2, b2, raw2,
             s == 201 and s2 == 409 and err(b2).get("code") == "idempotency_conflict")
        s, b, raw, _ = content("T_W", up1, other)
        case("W-U2", "other bytes to the original upload: checksum_mismatch", "T_W", "U1 upload_id, other bytes", s, b, raw,
             s == 422 and err(b).get("code") == "checksum_mismatch")

        # ── W-U3: 4 MiB ──────────────────────────────────────────────────────────────────────────────────────────
        s, b, raw, _ = create("T_W", f"{TAG}-U3.pdf", u1, k("U3-declared"), declared=MAX_BYTES + 1)
        case("W-U3", "declared size over 4 MiB", "T_W", "U3 create", s, b, raw, s == 413 and err(b).get("code") == "FILE_TOO_LARGE"
             and LIMIT_TEXT in str(err(b).get("message") or ""))
        small = tiny_pdf("U3")
        s, b, raw, up3 = create("T_W", f"{TAG}-U3.pdf", small, k("U3-actual"))
        big = small + b"\0" * (MAX_BYTES + 1 - len(small))
        s2, b2, raw2, _ = content("T_W", up3, big)
        case("W-U3", "actual body over 4 MiB", "T_W", "U3 content", s2, b2, raw2, s == 201 and s2 == 413 and err(b2).get("code") == "payload_too_large"
             and LIMIT_TEXT in str(err(b2).get("message") or ""))

        # ── W-U4: unsafe PDF ─────────────────────────────────────────────────────────────────────────────────────
        s, b, raw, up4 = create("T_W", f"{TAG}-U4.pdf", JS_PDF, k("U4"))
        s2, b2, raw2, _ = content("T_W", up4, JS_PDF)
        d_u4 = res(b2).get("document_id")
        if d_u4:
            record_doc("U4", d_u4, A)
        case("W-U4", "unsafe PDF stored quarantined", "T_W", "U4 content", s2, b2, raw2, s2 == 201 and res(b2).get("status") == "quarantined")
        s, b, raw, _ = file_("T_W", d_u4 or str(uuid.uuid4()), "child", C1, STANDARD_TYPE, k("U4-file"))
        refused_stop("T_W files a quarantined upload", s)
        case("W-U4", "quarantined upload cannot be filed", "T_W", "U4 filing", s, b, raw, s == 409 and err(b).get("code") == "DOCUMENT_QUARANTINED")

        # ── W-U5: another org's installation and this upload ─────────────────────────────────────────────────────
        u5 = tiny_pdf("U5")
        s, b, raw, up5 = create("T_W", f"{TAG}-U5.pdf", u5, k("U5"))
        s2, b2, raw2, _ = content("T_WB", up5, u5)
        refused_stop("T_WB bytes to T_W's upload", s2)
        case("W-U5", "other org's bytes to this upload", "T_WB", "U5 content", s2, b2, raw2, s == 201 and s2 == 404 and err(b2).get("code") == "NOT_FOUND")
        s, b, raw, _ = content("T_W", up5, u5)
        d_u5 = res(b).get("document_id")
        if d_u5:
            record_doc("U5", d_u5, A)
        # If T_WB had stored anything, this would be a 200 replay of its document.
        case("W-U5", "nothing was stored by the refused call", "T_W", "U5 content", s, b, raw, s == 201 and res(b).get("replay") is False)

        # ── W-F1 / W-F2: file, then retry ────────────────────────────────────────────────────────────────────────
        s, b, raw, _ = file_("T_W", d_u1, "child", C1, STANDARD_TYPE, k("F1"))
        r = res(b)
        sl, bl, rawl, got = listed("T_A", f"child_id={C1}")
        case("W-F1", "file the upload to C1", "T_W", "U1 -> C1", s, b, raw, s == 201 and r.get("filed_document_id") == d_u1
             and r.get("mode") == "new_document" and r.get("replay") is False and sl == 200 and d_u1 in got)
        sh, bh, rawh, _ = v1("T_A", f"/documents/{d_u1}/history")
        entries = (bh or {}).get("data") or []
        case("W-F1", "history: committed, and no person named", "T_A", "U1 history", sh, bh, rawh,
             sh == 200 and any(e.get("kind") == "committed" for e in entries) and no_person(rawh))
        s, b, raw, _ = file_("T_W", d_u1, "child", C1, STANDARD_TYPE, k("F1"))
        sl, bl, rawl, got = listed("T_A", f"child_id={C1}")
        case("W-F2", "retry of the filing", "T_W", "U1 -> C1 again", s, b, raw, s == 200 and res(b).get("replay") is True
             and res(b).get("filed_document_id") == d_u1 and got.count(d_u1) == 1)

        # ── W-F3: refused filings change nothing ─────────────────────────────────────────────────────────────────
        target = d_u5 or str(uuid.uuid4())
        s, b, raw, _ = file_("T_W", target, "child", C1, MEDICAL_TYPE, k("F3-medical"))
        refused_stop("T_W files a medical type", s)
        case("W-F3", "medical type refused", "T_W", "U5 as medical", s, b, raw, s == 422 and err(b).get("code") == "TYPE_NOT_AVAILABLE_EXTERNALLY")
        s, b, raw, _ = file_("T_W", target, "child", CB, STANDARD_TYPE, k("F3-foreign"))
        refused_stop("T_W files to another org's child", s)
        case("W-F3", "another org's child refused", "T_W", "U5 -> CB", s, b, raw, s == 404 and err(b).get("code") == "NOT_FOUND")
        d_ul, _ = upload("T_WL", "UL", tiny_pdf("UL"))
        s, b, raw, _ = file_("T_WL", d_ul, "child", C2, STANDARD_TYPE, k("F3-boundary"))
        refused_stop("T_WL files outside its boundary", s)
        case("W-F3", "outside the locations boundary refused", "T_WL", "UL -> C2", s, b, raw, s == 404 and err(b).get("code") == "NOT_FOUND")
        s, b, raw, _ = file_("T_WL", d_ul, "household", H1, STANDARD_TYPE, k("F3-inside"))
        case("W-F3", "inside the boundary files (control)", "T_WL", "UL -> H1", s, b, raw, s == 201)
        s, b, raw, _ = file_("T_W", target, "child", C2, STANDARD_TYPE, k("F3-after"))
        case("W-F3", "the refused upload is still unfiled (files to C2)", "T_W", "U5 -> C2", s, b, raw, s == 201 and res(b).get("replay") is False)

        # ── W-F4: a document this installation did not receive ───────────────────────────────────────────────────
        # A type C1 does not hold yet, so only "not received by this installation" can refuse it.
        s, b, raw, _ = file_("T_W", staff, "child", C1, LATE_TYPE, k("F4"))
        refused_stop("T_W files a staff upload", s)
        case("W-F4", "staff upload is not fileable", "T_W", "D_STAFF", s, b, raw, s == 404 and err(b).get("code") == "NOT_FOUND")

        # ── W-L1: context link, then unlink ──────────────────────────────────────────────────────────────────────
        link = {"document_id": d_u1, "subject_type": "household", "subject_id": H1}
        s, b, raw, _ = v1("T_W", "/document-subjects", link, k("L1-link"))
        _, _, _, dd = detail(d_u1)
        subj = {(x.get("type"), x.get("id"), x.get("role")) for x in dd.get("subjects") or []}
        case("W-L1", "link H1 as context", "T_W", "U1 + H1", s, b, raw, s == 200 and res(b).get("linked") is True
             and ("household", H1, "related") in subj and ("child", C1, "primary") in subj)
        s, b, raw, _ = v1("T_W", "/document-subjects/unlink", link, k("L1-unlink"))
        _, _, _, dd = detail(d_u1)
        subj = {(x.get("type"), x.get("id"), x.get("role")) for x in dd.get("subjects") or []}
        case("W-L1", "unlink H1", "T_W", "U1 - H1", s, b, raw, s == 200 and res(b).get("linked") is False
             and not any(x[1] == H1 for x in subj) and ("child", C1, "primary") in subj)
        s, b, raw, _ = v1("T_W", "/document-subjects/unlink", {"document_id": d_u1, "subject_type": "child", "subject_id": C1}, k("L1-owner"))
        case("W-L1", "the owner cannot be unlinked", "T_W", "U1 - C1", s, b, raw, s == 409 and err(b).get("code") == "primary_subject_immutable")

        # ── W-R1: replace the version ────────────────────────────────────────────────────────────────────────────
        _, _, _, dd = detail(d_u1)
        v1_id = (dd.get("current_version") or {}).get("id")
        d_ur, _ = upload("T_W", "UR", tiny_pdf("UR"))
        rep = {"document_id": d_u1, "upload_document_id": d_ur, "reason": f"D9-H2 hosted write proof {RUN}: replacement"}
        s, b, raw, _ = v1("T_W", "/document-versions", rep, k("R1"))
        _, _, _, dd = detail(d_u1)
        cur = dd.get("current_version") or {}
        sl, _, _, got = listed("T_A", f"child_id={C1}")
        case("W-R1", "replacement becomes version 2", "T_W", "U1 <- UR", s, b, raw, s == 201 and res(b).get("version_number") == 2
             and cur.get("number") == 2 and bool(v1_id) and cur.get("id") != v1_id and d_ur not in got)
        s, b, raw, _ = v1("T_W", "/document-versions", rep, k("R1"))
        case("W-R1", "retry of the replacement", "T_W", "U1 <- UR again", s, b, raw, s == 200 and res(b).get("replay") is True)
        sh, bh, rawh, _ = v1("T_A", f"/documents/{d_u1}/history")
        nums = {e.get("version_number") for e in (bh or {}).get("data") or []}
        case("W-R1", "version 1 is kept in the history", "T_A", "U1 history", sh, bh, rawh, sh == 200 and {1, 2} <= nums, versions=sorted(n for n in nums if n))
        v2_id = cur.get("id") or str(uuid.uuid4())

        # ── W-V1: validity dates on the current version ──────────────────────────────────────────────────────────
        val = {"document_id": d_u1, "version_id": v2_id, "effective_on": eff, "expires_on": exp}
        s, b, raw, _ = v1("T_W", "/document-validity", val, k("V1"))
        case("W-V1", "set validity", "T_W", "U1 v2 dates", s, b, raw, s == 201 and res(b).get("changed") is True and res(b).get("expires_on") == exp)
        s, b, raw, _ = v1("T_W", "/document-validity", val, k("V1-again"))
        case("W-V1", "same dates again", "T_W", "U1 v2 dates again", s, b, raw, s == 200 and res(b).get("changed") is False)
        s, b, raw, _ = v1("T_W", "/document-validity", {**val, "effective_on": exp, "expires_on": eff}, k("V1-inverted"))
        case("W-V1", "inverted range", "T_W", "U1 v2 inverted", s, b, raw, s == 400 and err(b).get("code") == "VALIDITY_RANGE_INVERTED")

        # ── W-RV1: one review, never a re-review ─────────────────────────────────────────────────────────────────
        rv = {"document_id": d_u1, "version_id": v2_id, "decision": "accepted"}
        s, b, raw, _ = v1("T_R", "/document-reviews", rv, k("RV1"))
        case("W-RV1", "accept the current version", "T_R", "U1 v2 accept", s, b, raw, s == 201 and res(b).get("review_status") == "accepted")
        s, b, raw, _ = v1("T_R", "/document-reviews", {**rv, "decision": "rejected", "reason": f"D9-H2 {RUN} change of mind"}, k("RV1-reject"))
        refused_stop("T_R re-review", s)
        case("W-RV1", "re-review refused", "T_R", "U1 v2 reject", s, b, raw, s == 403 and err(b).get("code") == "REREVIEW_NOT_AUTHORIZED")
        sr, br, rawr, _ = v1("T_A", f"/documents/{d_u1}/reviews")
        rows = (br or {}).get("data") or []
        decisions = [x for x in rows if x.get("kind") == "review" and x.get("version_id") == v2_id]
        case("W-RV1", "one decision, attributed to the application, no names", "T_A", "U1 reviews", sr, br, rawr,
             sr == 200 and len(decisions) == 1 and decisions[0].get("decision") == "accepted"
             and all(x.get("actor_kind") == "application" for x in rows) and no_person(rawr))

        # ── W-RQ1: requirements and the expiration query ─────────────────────────────────────────────────────────
        sq, bq, rawq, _ = v1("T_A", f"/document-requirements?child_id={C1}")
        rq = (bq or {}).get("data") or []
        shapes = all((set(x) == {"id", "requirement_key", "state", "restricted"}) if x.get("restricted") is True
                     else (x.get("restricted") is False and "state" in x) for x in rq)
        case("W-RQ1", "requirements: derived states; restricted shows key and state only", "T_A", "child_id=C1", sq, bq, rawq,
             sq == 200 and shapes, requirements=len(rq), restricted=sum(1 for x in rq if x.get("restricted") is True))
        day_after = (datetime.date.fromisoformat(exp) + datetime.timedelta(days=1)).isoformat()
        s1, b1, raw1, got1 = listed("T_A", f"child_id={C1}&expires_before={day_after}")
        s2, _, _, got2 = listed("T_A", f"child_id={C1}&expires_before={exp}")
        case("W-RQ1", "expires_before is strict", "T_A", f"expires_before {day_after} / {exp}", s1, b1, raw1,
             s1 == 200 and s2 == 200 and d_u1 in got1 and d_u1 not in got2)

        # ── W-AR / W-AR2: archive, then staff restore ────────────────────────────────────────────────────────────
        arc = {"document_id": d_u1, "reason": f"D9-H2 hosted write proof {RUN}: archive"}
        s, b, raw, _ = v1("T_WB", "/document-archives", arc, k("AR-foreign"))
        refused_stop("T_WB archives a QA Shared document", s)
        case("W-AR", "another org cannot archive it", "T_WB", "U1 archive", s, b, raw, s == 404 and err(b).get("code") == "NOT_FOUND")
        s, b, raw, _ = v1("T_W", "/document-archives", arc, k("AR"))
        case("W-AR", "archive", "T_W", "U1 archive", s, b, raw, s == 201 and res(b).get("archived") is True and res(b).get("replay") is False)
        s, b, raw, _ = v1("T_W", "/document-archives", arc, k("AR"))
        case("W-AR", "retry of the archive", "T_W", "U1 archive again", s, b, raw, s == 200 and res(b).get("replay") is True)
        sl, bl, rawl, got = listed("T_A", f"child_id={C1}")
        sd, _, _, _ = detail(d_u1)
        case("W-AR", "archived document is no longer listed or readable", "T_A", "child_id=C1", sl, bl, rawl, sl == 200 and d_u1 not in got and sd == 404)
        s, b, raw, _ = j(f"/api/admin/documents/{d_u1}/restore", A, {"reason": f"D9-H2 hosted write proof {RUN}: restore"})
        sl, _, _, got = listed("T_A", f"child_id={C1}")
        case("W-AR2", "staff restore returns the previous status and the listing", A, "U1 restore", s, b, raw,
             s == 200 and (b or {}).get("ok") is True and (b or {}).get("status") == "received" and d_u1 in got)

        # ── W-ES: the aged upload's Processing case (the staging wake opens it; the lane cannot trigger the wake) ──
        aged = load(AGED_FILE)
        aid = aged.get("document_id")
        received = aged.get("received_via_installation") or aged.get("installation_id")
        if aid != AGED_ID:
            skipped("W-ES", "aged upload escalated to one Processing case", "not_run",
                    f"{os.path.basename(AGED_FILE)} absent or not the fixture's id: qa_d9_aged_upload_ensure has not run")
        else:
            record_doc("AGED", aid, A, via="fixture")
            deadline, mine, sq, bq, rawq = time.monotonic() + ES_WAIT_S, [], 0, {}, b""
            while True:
                sq, bq, rawq, _ = call("/api/admin/processing/documents/queue", A)
                mine = [r for r in (bq or {}).get("rows") or [] if r.get("document_id") == aid]
                if mine or time.monotonic() >= deadline:
                    break
                time.sleep(ES_POLL_S)
            if sq == 200 and not mine:
                skipped("W-ES", "aged upload escalated to one Processing case", "not_run",
                        f"no Processing case for the aged upload within {ES_WAIT_S} s: the staging wake clock may be idle")
            else:
                case("W-ES", "exactly one open Processing case for the aged upload", A, "processing documents queue", sq, bq, rawq,
                     sq == 200 and len(mine) == 1 and mine[0].get("case_status") != "completed", cases_seen=len(mine))
                if not mine:
                    pass
                elif received != ids["installations"]["T_W"]["installation_id"]:
                    skipped("W-ES", "late filing closes the case", "not_run", "the aged upload was not received by this run's T_W installation")
                else:
                    s, b, raw, _ = file_("T_W", aid, "child", C1, LATE_TYPE, k("ES-late"))
                    sq, bq, rawq, _ = call("/api/admin/processing/documents/queue", A)
                    after = [r for r in (bq or {}).get("rows") or [] if r.get("document_id") == aid]
                    case("W-ES", "late filing closes the case", "T_W", "aged -> C1", s, b, raw,
                         s == 201 and len(after) == 1 and after[0].get("case_status") == "completed", cases_seen=len(after))
            skipped("W-ES", "a second wake adds nothing", "not_run", "needs wake evidence (scheduled_work_clock census); the driver cannot observe a wake")
        skipped("W-C1", "every write in a QA org; every effect audited first", "deferred", "the residue census and the write census decide it")
    except RuntimeError as e:
        stop = stop or f"setup stop: {e}"
    finally:
        revoked = revoke_and_disconnect(ids)
        tok.clear()

    ran = [c for c in cases if c["pass"] is not None]
    failed = [c for c in ran if not c["pass"]]
    not_run = [c for c in cases if c.get("outcome") == "not_run"]
    if failed or stop or not ran or not revoked["all_closed"]:
        verdict = "FAIL"
    else:
        verdict = "INCOMPLETE" if not_run else "PASS"
    out = {"qa_run_id": RUN, "plan": "documents_d9_write (unregistered)", "base": BASE, "at": now().isoformat(), "cases": cases,
           "passed": len(ran) - len(failed), "failed": len(failed), "not_run": len(not_run),
           "deferred": sum(1 for c in cases if c.get("outcome") == "deferred"), "stop": stop, "close": revoked, "verdict": verdict}
    emit(out, RESULTS_FILE)
    emit(line=f"certify {verdict}: {out['passed']} passed, {out['failed']} failed, {out['not_run']} not run; stop={stop}; access closed={revoked['all_closed']}")
    return 0 if verdict in ("PASS", "INCOMPLETE") else 1


def revoke_and_disconnect(ids):
    """Close every installation this run recorded: revoke its credential, then disconnect it. Never skipped."""
    rows = []
    for t, inst in (ids.get("installations") or {}).items():
        p, iid = inst["persona"], inst["installation_id"]
        rcs = {cid: call(f"/api/admin/integrations/installations/{iid}/credentials/{cid}", p, "DELETE")[0] for cid in inst.get("credential_ids") or []}
        rd = j(f"/api/admin/integrations/installations/{iid}", p, {"state": "revoked"}, "PATCH")[0]
        inst.update(credential_revoke_status=rcs, disconnect_status=rd)
        rows.append({"token": t, "installation_id": iid, "credential_revoke_status": rcs, "disconnect_status": rd})
    emit(ids, IDS_FILE)
    return {"rows": rows, "all_closed": all(r["disconnect_status"] == 200 and all(v == 200 for v in r["credential_revoke_status"].values()) for r in rows)}


# ── cleanup ──────────────────────────────────────────────────────────────────────────────────────────────────────
def cleanup():
    ids = load(IDS_FILE)
    out = {"qa_run_id": RUN, "at": now().isoformat(), "installations": [], "documents": [], "remaining": []}
    for p in (A, B):
        s, found = installations(p)
        if s != 200:
            out["remaining"].append(f"{p}: installations unreadable ({s})")
        for i in found:
            cred = i.get("credential") or {}
            rc = call(f"/api/admin/integrations/installations/{i['id']}/credentials/{cred['id']}", p, "DELETE")[0] \
                if cred.get("id") and cred.get("status") != "revoked" else "already"
            rd = j(f"/api/admin/integrations/installations/{i['id']}", p, {"state": "revoked"}, "PATCH")[0] if i.get("state") != "revoked" else "already"
            out["installations"].append({"persona": p, "installation_id": i["id"], "slug": i.get("applicationSlug"), "credential_revoke": rc, "disconnect": rd})
        s, again = installations(p)
        for i in again:
            if i.get("state") != "revoked" or (i.get("credential") or {}).get("status") not in (None, "revoked"):
                out["remaining"].append(f"{p}: installation {i['id']} state={i.get('state')} credential={(i.get('credential') or {}).get('status')}")
    # A 404 is "gone" only after this driver's own 200 for that document: the staff route also answers 404 for a
    # document it cannot read (an unfiled, quarantined or superseded API upload), which is not proof of removal.
    for key, doc in (ids.get("documents") or {}).items():
        if doc.get("deleted"):
            out["documents"].append({"key": key, "id": doc["id"], "delete": "already"})
            continue
        s1 = call(f"/api/admin/pos/documents/{doc['id']}", doc["owner"], "DELETE")[0]
        s2 = call(f"/api/admin/pos/documents/{doc['id']}", doc["owner"], "DELETE")[0] if s1 == 200 else None
        out["documents"].append({"key": key, "id": doc["id"], "via": doc.get("via"), "delete": s1, "verify": s2})
        if s1 == 200 and s2 == 404:
            doc["deleted"] = True
        else:
            why = "not visible to the staff delete (unfiled, quarantined or superseded); census decides" if s1 == 404 else f"delete={s1} verify={s2}"
            out["remaining"].append(f"document {key} ({doc.get('via')}): {why}")
    emit(ids, IDS_FILE)
    out["verdict"] = "CLEAN" if not out["remaining"] else "RESIDUE"
    out["next"] = ["qa_d9_write_fixture_reset (run order step 9): every remaining D9 write document, its rows and objects",
                   "qa_d9_external_fixture_reset (step 10), then qa_run_close #1 (step 11)",
                   "database.read_census d9-residue-census.sql after closed_at (step 12, all 15 registered checks)"]
    emit(out, RESET_FILE)
    emit(line=f"cleanup {out['verdict']}: {len(out['installations'])} installations closed, {len(out['documents'])} documents; remaining={out['remaining']}")
    return 0 if out["verdict"] == "CLEAN" else 1


sys.exit({"preflight": preflight, "install": install, "docs": docs, "certify": certify, "cleanup": cleanup}[PHASE]())
