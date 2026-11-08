"""Documents D9.1 (D9-H1) — hosted /api/v1 READ proof: the consumer driver of QA plan documents_d9_read_v1.

Usage: d9_hosted_read_cert.py <qa_run_id> preflight|docs|certify|cleanup

Contract: D9-1-HOSTED-QA-PLAN.md (sha256 1e9daebb…, pinned by the plan registry). It runs inside one open
documents_d9_read_v1 QA run, after qa_d9_external_fixture_ensure, as the run's fixture_admin (QA Shared) and
cross_org_admin (QA Secondary) sessions.

  preflight  reads only: served SHA contains D9.1; both D9 applications are active, neither is installed in either org.
  docs       uploads the twelve tagged documents (§3) through the admin routes and applies their changes.
  certify    installs T_A, T_B, T_L, T_N (§2.2), issues one credential each and exchanges it for a token at once, runs the
             matrix (§4), then ALWAYS revokes every credential and disconnects every installation it created, pass or
             stop. Every case is recorded with its request, status, code and body sha256.
  cleanup    idempotent and explicit: revokes any remaining credential of a D9 application, disconnects any remaining
             D9 installation, deletes every tagged document, then re-reads each to prove it is gone. Exits 1 if
             anything remains.

After cleanup, follow the run order of record (d9-hosted/D9-H1-HOSTED-RUN-ORDER.md): the case 11 link-audit census,
qa_d9_external_fixture_reset, qa_run_close #1, then d9-residue-census.sql (all 15 registered checks) read after closed_at,
then qa_run_close #2 naming that census. Zero residue is the census verdict, not this driver's.

SECRET-BLIND. A client secret, an access token or a signed link url is held in memory only. Every line printed and
every file written passes through emit(), which stops the run (exit 3) rather than write anything containing one.
Receipts carry installation id, credential id and token expiry only.
"""
import datetime, hashlib, json, os, re, subprocess, sys, urllib.error, urllib.parse, urllib.request, uuid

STAGING = "https://staging.workwithalloy.com"
# The driver's own tests point it at a loopback fake. Nothing else is accepted: hosted means staging.
_override = os.environ.get("D9_BASE_URL", "")
LOCAL = bool(re.fullmatch(r"http://127\.0\.0\.1:\d+", _override))
if _override and not LOCAL:
    sys.exit(f"refused: D9_BASE_URL may only be a loopback test server, not {_override}")
BASE = _override if LOCAL else STAGING
AUTH = os.environ["D9_AUTH_DIR"] if LOCAL and os.environ.get("D9_AUTH_DIR") else os.path.expanduser("~/.local/state/alloy-dev/gateway/auth/qa-runs")
HERE = os.environ["D9_OUT_DIR"] if LOCAL and os.environ.get("D9_OUT_DIR") else os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if len(sys.argv) != 3 or not re.fullmatch(r"qar_[0-9a-f]{12}", sys.argv[1]) or sys.argv[2] not in ("preflight", "docs", "certify", "cleanup"):
    sys.exit(__doc__.split("\n\n")[1])
RUN, PHASE = sys.argv[1], sys.argv[2]
TAG = f"qa-d9r-{RUN}"
D91_SHA = "daf87893f879"  # PR #1627: the D9.1 read routes
APPS = {"read": "d9-documents-read-cert", "scope": "d9-documents-scope-cert"}
NEVER = "alloy-cert-sandbox"
A, B = "fixture_admin", "cross_org_admin"
QA_NORTH = "21c9be10-f6e9-4048-ab4c-939ddbe0f0b7"
# qa_d9_external_fixture_ensure.sql's fixed ids (d9000000- namespace).
H1, G1, E1 = "d9000000-0000-4000-8000-000000000101", "d9000000-0000-4000-8000-000000000111", "d9000000-0000-4000-8000-000000000112"
C1, C2, CB = "d9000000-0000-4000-8000-000000000121", "d9000000-0000-4000-8000-000000000122", "d9000000-0000-4000-8000-000000000221"
TOKENS = {  # §2.2
    "T_A": {"app": "read", "persona": A, "scopes": ["documents.read"], "boundary": "org_wide"},
    "T_B": {"app": "read", "persona": B, "scopes": ["documents.read"], "boundary": "org_wide"},
    "T_L": {"app": "scope", "persona": A, "scopes": ["documents.read"], "boundary": "locations", "locations": [QA_NORTH]},
    "T_N": {"app": "scope", "persona": B, "scopes": ["children.read"], "boundary": "org_wide"},
}
DOCS = {  # §3: key -> (persona, entity_type, entity_id, doc_type, change)
    "D_STD_C": (A, "customer_member", C1, "other", None),
    "D_STD_H": (A, "customer", H1, "other", None),
    "D_STD_G": (A, "person", G1, "other", None),
    "D_STD_E": (A, "person", E1, "other", None),
    "D_MED": (A, "customer_member", C1, "immunization_record", None),
    "D_PID": (A, "customer_member", C1, "other", "personal_identity"),
    "D_CUS": (A, "customer_member", C1, "other", "custody_safeguarding"),
    "D_RES": (A, "customer_member", C1, "other", "restricted"),
    "D_QUA": (A, "customer_member", C1, "other", "quarantine"),
    "D_SUP": (A, "customer_member", C1, "other", "new_version"),
    "D_SOUTH": (A, "customer_member", C2, "other", None),
    "D_B": (B, "customer_member", CB, "other", None),
}
HELD = ["D_MED", "D_PID", "D_CUS", "D_RES", "D_QUA", "D_STD_E"]
IDS_FILE = os.path.join(HERE, f"d9r_hosted_fixture_ids.{RUN}.json")
PREFLIGHT_FILE = os.path.join(HERE, f"d9r_hosted_preflight.{RUN}.json")
RESULTS_FILE = os.path.join(HERE, f"d9r_hosted_results.{RUN}.json")
RESET_FILE = os.path.join(HERE, f"d9r_hosted_reset_results.{RUN}.json")
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


def call(path, persona=None, method="GET", body=None, ctype=None, bearer=None):
    h = {"accept": "application/json"}
    if persona:
        h["cookie"] = cookie(persona)
    if bearer:
        h["authorization"] = f"Bearer {bearer}"
    if method != "GET" and persona:
        h["origin"] = BASE
        h["referer"] = BASE + "/admin"
    if ctype:
        h["content-type"] = ctype
    req = urllib.request.Request(BASE + path, method=method, headers=h, data=body)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw, status, headers = r.read(), r.status, dict(r.headers)
    except urllib.error.HTTPError as e:
        raw, status, headers = e.read(), e.code, dict(e.headers)
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
    """The deployed single-resource envelope: GET /documents/{id} and /download-link answer {"data": {...}}
    (singleResourceThroughCollection, documentResources.ts at d93d6e17). A bare object is not that contract and reads as
    empty, so a case built on it fails; it never passes on a shape the product does not serve."""
    d = b.get("data") if isinstance(b, dict) else None
    return d if isinstance(d, dict) else {}


def tiny_pdf(label):
    text = f"QA D9 read fixture {label}"
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
    b = "----qad9r" + uuid.uuid4().hex
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
    out, ok = {"qa_run_id": RUN, "at": now().isoformat(), "checks": {}}, True
    s, b, _, _ = call("/api/build-info")
    sha = str((b or {}).get("gitSha") or "")
    has = bool(re.fullmatch(r"[0-9a-f]{7,40}", sha)) and subprocess.run(
        ["git", "-C", REPO, "merge-base", "--is-ancestor", D91_SHA, sha], capture_output=True).returncode == 0
    out["checks"]["served_sha_contains_d9_1"] = {"ok": has, "served": sha, "requires": D91_SHA}
    for p in (A, B):
        s, apps = applications(p)
        for k, slug in APPS.items():
            a = apps.get(slug) or {}
            good = s == 200 and a.get("status") == "active" and a.get("alreadyInstalled") is False
            out["checks"][f"{p}:{slug}"] = {"ok": good, "status": s, "id": a.get("id"), "already_installed": a.get("alreadyInstalled")}
    ok = all(c["ok"] for c in out["checks"].values())
    out["verdict"] = "READY" if ok else "STOP"
    emit(out, PREFLIGHT_FILE)
    emit(line=f"preflight {out['verdict']}: " + ", ".join(f"{k}={'ok' if v['ok'] else 'NO'}" for k, v in out["checks"].items()))
    return 0 if ok else 1


# ── docs: W4 ─────────────────────────────────────────────────────────────────────────────────────────────────────
def docs():
    if load(PREFLIGHT_FILE).get("verdict") != "READY":
        emit(line="docs refused: preflight is not READY")
        return 1
    ids = load(IDS_FILE)
    ids.setdefault("documents", {})
    for key, (persona, etype, eid, dtype, change) in DOCS.items():
        if key in ids["documents"]:
            continue
        content = JS_PDF if change == "quarantine" else tiny_pdf(key)
        body, ct = multipart({"entity_type": etype, "entity_id": eid, "doc_type": dtype, "title": f"{TAG} {key}"}, f"{TAG}-{key}.pdf", content)
        s, b, _, _ = call("/api/admin/documents/upload", persona, "POST", body, ct)
        did = ((b or {}).get("document") or {}).get("id") if isinstance(b, dict) else None
        emit(line=f"upload {key} as {persona}: status={s} code={err(b).get('code')} has_id={bool(did)}")
        if not did:
            return 1
        ids["documents"][key] = {"id": did, "owner": persona}
        emit(ids, IDS_FILE)  # recorded at once, so cleanup finds it even if a later step stops
        if change in ("personal_identity", "custody_safeguarding", "restricted"):
            s, b, _, _ = j(f"/api/admin/documents/{did}/sensitivity", persona, {"sensitivity": change, "reason": f"D9.1 hosted read proof {RUN}: held class"})
            ok = s == 200 and (b or {}).get("sensitivity") == change
        elif change == "quarantine":
            ok = s == 200 and ((b or {}).get("screening") or {}).get("verdict") == "quarantine"
        elif change == "new_version":
            vb, vct = multipart({"reason": f"D9.1 hosted read proof {RUN}: second version"}, f"{TAG}-{key}-v2.pdf", tiny_pdf(key + "-v2"))
            s, b, _, _ = call(f"/api/admin/documents/{did}/versions", persona, "POST", vb, vct)
            ok = s in (200, 201)
        else:
            ok = True
        emit(line=f"  change {key}={change}: status={s} ok={ok}")
        if not ok:
            return 1
    return 0


# ── certify: W2 + matrix + revoke/disconnect ─────────────────────────────────────────────────────────────────────
def certify():
    ids = load(IDS_FILE)
    d = {k: v["id"] for k, v in ids.get("documents", {}).items()}
    if set(d) != set(DOCS) or load(PREFLIGHT_FILE).get("verdict") != "READY":
        emit(line="certify refused: preflight not READY or the twelve documents are not all recorded")
        return 1
    ids.setdefault("installations", {})
    cases, stop, tok, links = [], None, {}, []

    def case(n, name, persona, req, s, b, raw, ok, **extra):
        cases.append({"case": n, "name": name, "as": persona, "request": req, "status": s, "code": err(b).get("code"),
                      "type": err(b).get("type"), "body_sha256": hashlib.sha256(raw or b"").hexdigest(), "pass": bool(ok), **extra})

    try:
        # W2: install, issue, exchange. The secret lives for the length of this block.
        for t, spec in TOKENS.items():
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
            ids["installations"][t] = {"installation_id": iid, "persona": spec["persona"], "credential_id": None}
            emit(ids, IDS_FILE)
            s, b, _, _ = j(f"/api/admin/integrations/installations/{iid}/credentials", spec["persona"], {"label": f"{TAG} {t}"})
            secret, client_id = (b or {}).get("clientSecret"), (b or {}).get("clientId")
            if secret:
                _secrets.add(secret)
            if s != 201 or not secret:
                raise RuntimeError(f"{t}: credential refused status={s}")
            ids["installations"][t]["credential_id"] = b.get("credentialId")
            emit(ids, IDS_FILE)
            s, b, _, _ = j("/api/v1/oauth/token", None, {"grant_type": "client_credentials", "client_id": client_id, "client_secret": secret})
            secret = None
            access = (b or {}).get("access_token")
            if access:
                _secrets.add(access)
            if s != 200 or not access:
                raise RuntimeError(f"{t}: token refused status={s} code={err(b).get('code')}")
            tok[t] = access
            ids["installations"][t]["token_exp"] = (now() + datetime.timedelta(seconds=int(b.get("expires_in") or 0))).isoformat()
            emit(ids, IDS_FILE)

        def v1(t, path):
            return call(f"/api/v1{path}", bearer=tok[t])

        def listed(t, q):
            got, cursor, pages, sync = [], None, 0, None
            while pages < 20:
                s, b, raw, _ = v1(t, f"/documents?{q}" + (f"&cursor={urllib.parse.quote(cursor)}" if cursor else ""))
                if s != 200:
                    return s, b, raw, got, sync
                got += [x["id"] for x in b.get("data", [])]
                cursor, sync, pages = b.get("next_cursor"), b.get("sync_token"), pages + 1
                if not cursor:
                    return s, b, raw, got, sync
            return 0, {}, b"", got, sync

        def links_issued(did):
            """Case 11 without a clock: the document's audited link issuances as the staff history reads them
            (GET /api/admin/documents/{id}/history; workflow_events document_link_issued -> kind "access"). Read-only.
            None when it cannot be read, which fails the case that asked."""
            s, b, _, _ = call(f"/api/admin/documents/{did}/history", A)
            entries = b.get("entries") if isinstance(b, dict) else None
            if s != 200 or not isinstance(entries, list):
                return None
            return sum(1 for e in entries if isinstance(e, dict) and e.get("kind") == "access" and e.get("action") == "Download link issued")

        def not_found_shape(raw, headers):
            body = json.loads(raw)
            body.get("error", {}).pop("request_id", None)
            hk = sorted(k for k in headers if k not in ("date", "x-request-id", "x-vercel-id", "age", "content-length") and not k.startswith("ratelimit"))
            return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest(), hk

        # 1 scope refused before any read
        for op in ("/document-categories", f"/documents?child_id={C1}", f"/documents/{d['D_STD_C']}", f"/documents/{d['D_STD_C']}/download-link"):
            s, b, raw, _ = v1("T_N", op)
            case(1, "scope refused before any read", "T_N", op, s, b, raw, s == 403 and err(b).get("type") == "forbidden_scope")
        # 2 categories
        s, b, raw, _ = v1("T_A", "/document-categories")
        data = (b or {}).get("data") or []
        case(2, "categories", "T_A", "/document-categories", s, b, raw, s == 200 and len(data) > 0 and all("parent_key" in c for c in data))
        # 3 list by subject
        held = {d[k] for k in HELD}
        for q, want in ((f"child_id={C1}", {d["D_STD_C"], d["D_SUP"]}), (f"household_id={H1}", {d["D_STD_H"]}), (f"person_id={G1}", {d["D_STD_G"]})):
            s, b, raw, got, _ = listed("T_A", q)
            case(3, "list by subject", "T_A", q, s, b, raw, s == 200 and want <= set(got) and not (held & set(got)) and d["D_B"] not in got)
        # 4 exactly one subject parameter
        for q in ("", f"child_id={C1}&household_id={H1}"):
            s, b, raw, _ = v1("T_A", f"/documents?{q}")
            case(4, "exactly one subject parameter", "T_A", q or "(none)", s, b, raw, s == 400 and err(b).get("code") == "subject_filter_required")
        # 5 non-guardian person answers as an unknown person
        s5, b5, raw5, got5, _ = listed("T_A", f"person_id={E1}")
        su, bu, rawu, gotu, _ = listed("T_A", f"person_id={uuid.uuid4()}")
        case(5, "non-guardian person = unknown person", "T_A", "person_id=E1", s5, b5, raw5, (s5, got5) == (su, gotu) and not got5)
        # 6 detail
        s, b, raw, _ = v1("T_A", f"/documents/{d['D_STD_C']}")
        text = raw.decode(errors="replace").lower()
        case(6, "detail", "T_A", "D_STD_C", s, b, raw, s == 200 and one(b).get("id") == d["D_STD_C"]
             and not any(k in text for k in ("storage_path", "bucket", "\"url\"", "http://", "https://")))
        # 7 indistinguishable 404 (and 8: T_A → D_B)
        shapes = set()
        for key in HELD + ["D_B", "random"]:
            target = d.get(key) or str(uuid.uuid4())
            for suffix in ("", "/download-link"):
                s, b, raw, h = v1("T_A", f"/documents/{target}{suffix}")
                if s == 200:
                    stop = stop or f"security stop: T_A received 200 for {key}{suffix}"
                shape = not_found_shape(raw, h) if s == 404 else None
                if shape:
                    shapes.add((shape[0], tuple(shape[1])))
                case(7 if key != "D_B" else 8, "indistinguishable 404", "T_A", f"{key}{suffix}", s, b, raw, s == 404)
        case(7, "404 body and header set byte-identical", "T_A", "all of the above", 200 if len(shapes) == 1 else 0, {}, b"", len(shapes) == 1, distinct_shapes=len(shapes))
        # 8 cross-org
        for path, label in ((f"/documents/{d['D_STD_C']}", "D_STD_C"), (f"/documents/{d['D_STD_C']}/download-link", "D_STD_C link")):
            before = links_issued(d["D_STD_C"]) if label.endswith("link") else None
            s, b, raw, _ = v1("T_B", path)
            if s == 200:
                stop = stop or f"security stop: T_B received 200 for {label}"
            case(8, "cross-org", "T_B", label, s, b, raw, s == 404)
            if label.endswith("link"):
                after = links_issued(d["D_STD_C"])
                case(11, "refused link call not audited", "T_B", label, s, {}, b"", s == 404 and before is not None and after == before,
                     links_issued_before=before, links_issued_after=after)
        s, b, raw, got, _ = listed("T_B", f"child_id={C1}")
        case(8, "cross-org list", "T_B", "child_id=C1", s, b, raw, s == 200 and not got)
        # 9 locations boundary
        s, b, raw, _ = v1("T_L", f"/documents/{d['D_SOUTH']}")
        if s == 200:
            stop = stop or "security stop: T_L received 200 for D_SOUTH"
        case(9, "locations boundary", "T_L", "D_SOUTH", s, b, raw, s == 404)
        s, b, raw, got, _ = listed("T_L", f"child_id={C2}")
        case(9, "locations boundary list", "T_L", "child_id=C2", s, b, raw, s == 200 and not got)
        s, b, raw, _ = v1("T_L", f"/documents/{d['D_STD_C']}")
        case(9, "in-boundary detail", "T_L", "D_STD_C", s, b, raw, s == 200)
        # 10 + 12 download link, new per call (11 is the census's: these times are its input)
        for i in (1, 2):
            before = links_issued(d["D_STD_C"])
            sent = now()
            s, b, raw, _ = v1("T_A", f"/documents/{d['D_STD_C']}/download-link")
            got_at = now()
            after = links_issued(d["D_STD_C"])
            r = one(b)
            url = r.get("url") or ""
            if url:
                _secrets.add(url)
                links.append(url)
            exp = r.get("expires_at")
            ttl = (datetime.datetime.fromisoformat(exp.replace("Z", "+00:00")) - got_at).total_seconds() if exp else None
            host = urllib.parse.urlparse(url).hostname or ""
            case(10, "download link", "T_A", "D_STD_C", s, b, raw, s == 200 and r.get("document_id") == d["D_STD_C"]
                 and ttl is not None and 0 < ttl <= 600 and host.endswith(".supabase.co") and "path" not in r and "path" not in (b or {}),
                 call_index=i, sent_at=sent.isoformat(), response_at=got_at.isoformat(), url_host=host,
                 url_sha256=hashlib.sha256(url.encode()).hexdigest(), ttl_seconds=ttl)
            # 11: the audit row is committed and readable by the first request after the response: absent from the
            # history read that completed before the call was sent, present in the one sent after its response arrived.
            # Happens-before, not clocks. That the audit precedes the signing inside the request is the route's order,
            # locked by web/tests/platform/external/documentsResource.test.ts ("no audit record, no link").
            case(11, "audit visible after link response", "T_A", "D_STD_C", s, {}, b"",
                 s == 200 and before is not None and after == before + 1, call_index=i, links_issued_before=before, links_issued_after=after)
        case(12, "new link per call", "T_A", "D_STD_C x2", 200 if len(set(links)) == 2 else 0, {}, b"", len(set(links)) == 2)
        # 13 paging
        s, b, raw, got, sync = listed("T_A", f"child_id={C1}&limit=1")
        case(13, "paging", "T_A", "child_id=C1&limit=1", s, b, raw, s == 200 and len(got) == len(set(got)) and {d["D_STD_C"], d["D_SUP"]} <= set(got)
             and sync is not None, pages_ids=len(got))
        # 14 version-current
        s, b, raw, _ = v1("T_A", f"/documents/{d['D_SUP']}")
        case(14, "version-current", "T_A", "D_SUP", s, b, raw, s == 200 and (one(b).get("current_version") or {}).get("number") == 2)
    except RuntimeError as e:
        stop = stop or f"setup stop: {e}"
    finally:
        revoked = revoke_and_disconnect(ids)
        tok.clear()
        links.clear()

    failed = [c for c in cases if not c["pass"]]
    out = {"qa_run_id": RUN, "plan": "documents_d9_read_v1", "base": BASE, "at": now().isoformat(), "cases": cases,
           "passed": len(cases) - len(failed), "failed": len(failed), "stop": stop, "close": revoked,
           "verdict": "PASS" if not failed and not stop and cases and revoked["all_closed"] else "FAIL"}
    emit(out, RESULTS_FILE)
    emit(line=f"certify {out['verdict']}: {out['passed']} passed, {out['failed']} failed; stop={stop}; access closed={revoked['all_closed']}")
    return 0 if out["verdict"] == "PASS" else 1


def revoke_and_disconnect(ids):
    """Close every installation this run recorded: revoke its credential, then disconnect it. Never skipped."""
    rows = []
    for t, inst in (ids.get("installations") or {}).items():
        p, iid, cid = inst["persona"], inst["installation_id"], inst.get("credential_id")
        rc = call(f"/api/admin/integrations/installations/{iid}/credentials/{cid}", p, "DELETE")[0] if cid else None
        rd = j(f"/api/admin/integrations/installations/{iid}", p, {"state": "revoked"}, "PATCH")[0]
        inst.update(credential_revoke_status=rc, disconnect_status=rd)
        rows.append({"token": t, "installation_id": iid, "credential_id": cid, "credential_revoke_status": rc, "disconnect_status": rd})
    emit(ids, IDS_FILE)
    return {"rows": rows, "all_closed": all(r["disconnect_status"] == 200 and r["credential_revoke_status"] in (200, None) for r in rows)}


# ── cleanup: explicit, idempotent, verified ──────────────────────────────────────────────────────────────────────
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
    for key, doc in (ids.get("documents") or {}).items():
        s1 = call(f"/api/admin/pos/documents/{doc['id']}", doc["owner"], "DELETE")[0]
        s2 = call(f"/api/admin/pos/documents/{doc['id']}", doc["owner"], "DELETE")[0]  # the re-read: gone answers 404
        out["documents"].append({"key": key, "id": doc["id"], "delete": s1, "verify": s2})
        if s1 not in (200, 404) or s2 != 404:
            out["remaining"].append(f"document {key} delete={s1} verify={s2}")
    out["verdict"] = "CLEAN" if not out["remaining"] else "RESIDUE"
    out["next"] = ["database.read_census d9-link-audit-census.sql (case 11)", "qa_d9_external_fixture_reset", "environment.qa_run_close #1",
                   "database.read_census d9-residue-census.sql after closed_at (all 15 registered checks)", "environment.qa_run_close #2 naming that census"]
    emit(out, RESET_FILE)
    emit(line=f"cleanup {out['verdict']}: {len(out['installations'])} installations closed, {len(out['documents'])} documents removed; remaining={out['remaining']}")
    return 0 if out["verdict"] == "CLEAN" else 1


sys.exit({"preflight": preflight, "docs": docs, "certify": certify, "cleanup": cleanup}[PHASE]())
