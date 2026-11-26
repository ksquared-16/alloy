"""Local proof of d9_hosted_write_cert.py (the D9-H2 write consumer driver). No network, no database.

The driver runs as a subprocess against a loopback synthetic product: an in-memory model of the D9.2 / D9.3 write
authority as staging 5db26b46 serves it (externalOperationRoute scope order and bare-result bodies;
externalDocumentWrites uploads, links and filings; externalDocumentLifecycle validity, replacement, review, archive;
the staff restore and the Processing documents queue) and of the Integrations admin routes. A conforming product must
pass every executed case and leave no installation or credential active. Each defect must turn its case to FAIL, and
access must still be closed. A secret or an upload id must never reach stdout, stderr or a file.

    python3 -I certification/documents-v1/test_d9_hosted_write_cert.py -v   (from the repository root)
"""
import datetime, hashlib, json, os, re, shutil, subprocess, sys, tempfile, threading, unittest, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
DRIVER = os.path.join(HERE, "d9_hosted_write_cert.py")
RUN = "qar_00000000d9b2"
QA_SHARED, QA_SECONDARY = "4acc9386-c485-486f-aa1f-05d83499d142", "ad53fee2-2570-460f-9300-f0e106c473b6"
NORTH, SOUTH, SEC_SITE = "21c9be10-f6e9-4048-ab4c-939ddbe0f0b7", "cfb73302-3bbe-49db-b173-876fda776a6d", "4f89f324-dbc5-4815-8431-38ffec891398"
H1 = "d9000000-0000-4000-8000-000000000101"
C1, C2, CB = "d9000000-0000-4000-8000-000000000121", "d9000000-0000-4000-8000-000000000122", "d9000000-0000-4000-8000-000000000221"
AGED = "d9000000-0000-4000-8000-000000000301"
CHILD_SITE = {C1: NORTH, C2: SOUTH, CB: SEC_SITE}
ORG_OF = {C1: QA_SHARED, C2: QA_SHARED, H1: QA_SHARED, CB: QA_SECONDARY}
PERSONA_ORG = {"fixture_admin": QA_SHARED, "cross_org_admin": QA_SECONDARY}
HEAD = subprocess.run(["git", "-C", HERE, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
MAX = 4 * 1024 * 1024
LIMIT = "Files sent through the API must be at most 4 MiB (4,194,304 bytes)."
SCOPE = {"/api/v1/document-uploads": "documents.write", "/api/v1/document-uploads/content": "documents.write",
         "/api/v1/document-filings": "documents.write", "/api/v1/document-subjects": "documents.write",
         "/api/v1/document-subjects/unlink": "documents.write", "/api/v1/document-validity": "documents.write",
         "/api/v1/document-versions": "documents.write", "/api/v1/document-reviews": "documents.review",
         "/api/v1/document-archives": "documents.write"}
TYPES = {"enrollment_document": "standard", "generated_form_pdf": "standard", "immunization_record": "medical", "other": "standard"}
AVAILABLE = ("received", "uploaded")


class Product:
    def __init__(self, defects=()):
        self.defects = set(defects)
        self.apps = {s: str(uuid.uuid4()) for s in ("d9-documents-read-cert", "d9-documents-write-cert", "d9-documents-review-cert",
                                                     "d9-documents-write-scope-cert", "d9-documents-scope-cert", "alloy-cert-sandbox")}
        self.inst, self.creds, self.tokens, self.docs, self.uploads, self.cases = {}, {}, {}, {}, {}, {}
        self.secrets = set()

    def subject_visible(self, inst, sid):
        if ORG_OF.get(sid) != inst["org"]:
            return False
        site_ok = lambda c: inst["boundary"] == "org_wide" or CHILD_SITE[c] in inst["locations"] or "boundary_leak_write" in self.defects
        if sid in CHILD_SITE:
            return site_ok(sid)
        return site_ok(C1) if sid == H1 else False

    def doc_visible(self, inst, d):
        """D9.1 reach: filed, available, standard, this org, primary subject visible."""
        if d["org"] != inst["org"] or not d["primary"]:
            return False
        if d["status"] not in AVAILABLE and not (d["status"] == "archived" and "archive_still_listed" in self.defects):
            return False
        return TYPES.get(d["type"]) == "standard" and self.subject_visible(inst, d["primary"][1])


class Handler(BaseHTTPRequestHandler):
    product = None

    def log_message(self, *a):
        pass

    def reply(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(raw)

    def refuse(self, status, code, message="refused."):
        types = {400: "invalid_request", 403: "forbidden_scope", 404: "not_found", 409: "conflict", 413: "invalid_request", 422: "invalid_request"}
        return self.reply(status, {"error": {"code": code, "type": types.get(status, "internal_error"), "message": message, "request_id": str(uuid.uuid4())}})

    def body(self):
        if not hasattr(self, "_body"):
            n = int(self.headers.get("content-length") or 0)
            self._body = self.rfile.read(n) if n else b""
        return self._body

    def persona(self):
        m = re.search(r"sb-qa=([a-z_]+)-session", self.headers.get("cookie", ""))
        return m.group(1) if m else None

    do_GET = lambda self: self.route("GET")
    do_POST = lambda self: self.route("POST")
    do_PATCH = lambda self: self.route("PATCH")
    do_DELETE = lambda self: self.route("DELETE")

    def route(self, method):
        self.body()
        P, u = self.product, urlparse(self.path)
        path, q = u.path, parse_qs(u.query)
        if path == "/api/build-info":
            return self.reply(200, {"gitSha": HEAD})
        if path == "/api/v1/openapi":
            return self.reply(200, {"paths": {"/api/v1/document-reviews": {"post": {"operationId": "createDocumentUpload" if "openapi_no_review" in P.defects else "submitDocumentReview"}}}})
        if path.startswith("/api/v1/"):
            return self.v1(method, path, q)
        who = self.persona()
        if not who:
            return self.reply(401, {"error": "Unauthorized"})
        org = PERSONA_ORG[who]
        if path == "/api/admin/integrations/applications":
            have = {i["app"] for i in P.inst.values() if i["org"] == org and i["state"] != "revoked"}
            return self.reply(200, {"applications": [{"id": i, "slug": s, "status": "active", "alreadyInstalled": i in have} for s, i in P.apps.items()]})
        if path == "/api/admin/integrations/installations" and method == "GET":
            slug = {i: s for s, i in P.apps.items()}
            rows = []
            for k, i in P.inst.items():
                if i["org"] != org:
                    continue
                live = [c for c in i["creds"] if P.creds[c]["status"] == "active"]
                cred = live[0] if live else (i["creds"][-1] if i["creds"] else None)
                rows.append({"id": k, "applicationSlug": slug[i["app"]], "state": i["state"], "credential": {"id": cred, "status": P.creds[cred]["status"]} if cred else None})
            return self.reply(200, {"installations": rows})
        if path == "/api/admin/integrations/installations" and method == "POST":
            b = json.loads(self.body())
            if "install_refused_T_R" in P.defects and b["grantedScopes"] == ["documents.review"]:
                return self.reply(403, {"error": "refused"})
            if any(i["app"] == b["applicationId"] and i["org"] == org and i["state"] != "revoked" for i in P.inst.values()):
                return self.reply(409, {"error": "already connected"})
            iid = str(uuid.uuid4())
            P.inst[iid] = {"app": b["applicationId"], "org": org, "scopes": b["grantedScopes"], "boundary": b["boundaryMode"],
                           "locations": b.get("locationIds", []), "state": "active", "creds": []}
            return self.reply(201, {"installationId": iid})
        m = re.fullmatch(r"/api/admin/integrations/installations/([^/]+)(/credentials(?:/([^/]+))?)?", path)
        if m:
            iid, cred_path, cid = m.groups()
            inst = P.inst.get(iid)
            if not inst or inst["org"] != org:
                return self.reply(404, {"error": "not found"})
            if cred_path and method == "POST":
                if inst["state"] == "revoked":
                    return self.reply(409, {"error": "This integration is disconnected."})
                cid, secret, client = str(uuid.uuid4()), "sk_" + uuid.uuid4().hex, "cl_" + uuid.uuid4().hex
                P.creds[cid] = {"inst": iid, "secret": secret, "client": client, "status": "active"}
                P.secrets.add(secret)
                inst["creds"].append(cid)  # issueCredential never revokes an earlier credential
                return self.reply(201, {"credentialId": cid, "clientId": client, "clientSecret": secret, "shownOnce": True})
            if cred_path and method == "DELETE":
                P.creds[cid]["status"] = "revoked"
                return self.reply(200, {"revoked": True})
            if method == "PATCH":
                inst["state"] = json.loads(self.body())["state"]
                return self.reply(200, {"ok": True})
        if path == "/api/admin/documents/upload":
            f = dict(re.findall(rb'name="(\w+)"\r\n\r\n([^\r]*)\r\n', self.body()))
            did = str(uuid.uuid4())
            P.docs[did] = {"org": org, "status": "received", "received_via": None, "primary": ("child", f[b"entity_id"].decode()),
                           "related": set(), "type": f[b"doc_type"].decode(), "filing_keys": {}, "versions": [str(uuid.uuid4())],
                           "reviews": [], "validity": None, "sha": None, "archive": None}
            return self.reply(200, {"document": {"id": did}})
        m = re.fullmatch(r"/api/admin/documents/([^/]+)/restore", path)
        if m:
            d = P.docs.get(m.group(1))
            if not d or d["org"] != org:
                return self.reply(404, {"ok": False, "code": "NOT_FOUND"})
            if d["status"] != "archived":
                return self.reply(409, {"ok": False, "code": "NOT_ARCHIVED"})
            if "restore_broken" in P.defects:
                return self.reply(500, {"ok": False, "code": "RESTORE_FAILED"})
            d["status"] = d["archive"]["previous"]
            return self.reply(200, {"ok": True, "document_id": m.group(1), "status": d["status"]})
        if path == "/api/admin/processing/documents/queue":
            rows = [{"case_id": c["id"], "document_id": did, "case_status": c["status"]} for did, cs in P.cases.items() for c in cs if P.docs.get(did, {}).get("org") == org]
            return self.reply(200, {"ok": True, "rows": rows})
        m = re.fullmatch(r"/api/admin/pos/documents/([^/]+)", path)
        if m and method == "DELETE":
            d = P.docs.get(m.group(1))
            # documentReadableByCaller: a staff caller reads filed, available documents only.
            if not d or d["org"] != org or not d["primary"] or d["status"] not in AVAILABLE:
                return self.reply(404, {"error": "Not found"})
            if any(c["status"] == "completed" for c in P.cases.get(m.group(1), [])):
                return self.reply(409, {"error": "This document's Processing case is completed/archived"})
            del P.docs[m.group(1)]
            return self.reply(200, {"data": {"deleted": True}})
        return self.reply(404, {"error": f"no route {method} {path}"})

    # ── /api/v1 ──────────────────────────────────────────────────────────────────────────────────────────────────
    def v1(self, method, path, q):
        P = self.product
        if path == "/api/v1/oauth/token":
            b = json.loads(self.body())
            c = next((c for c in P.creds.values() if c["client"] == b.get("client_id") and c["secret"] == b.get("client_secret") and c["status"] == "active"), None)
            if not c:
                return self.refuse(401, "invalid_client")
            t = "at_" + uuid.uuid4().hex
            P.tokens[t] = c["inst"]
            P.secrets.add(t)
            return self.reply(200, {"access_token": t, "token_type": "Bearer", "expires_in": 900})
        t = (self.headers.get("authorization") or "")[7:]
        iid = P.tokens.get(t, "")
        inst = P.inst.get(iid)
        if not inst or inst["state"] != "active":
            return self.refuse(401, "invalid_credential")
        if method == "POST":
            need = SCOPE.get(path)
            if need and need not in inst["scopes"]:
                if "scope_leak" in P.defects and path == "/api/v1/document-validity":
                    return self.reply(201, {"changed": True})
                return self.refuse(403, t if "echo_token" in P.defects else "forbidden_scope")
            key = self.headers.get("idempotency-key")
            if path == "/api/v1/document-uploads/content":
                return self.content(inst, iid, q)
            b = json.loads(self.body() or b"{}")
            return getattr(self, {"/api/v1/document-uploads": "create", "/api/v1/document-filings": "file",
                                  "/api/v1/document-subjects": "link", "/api/v1/document-subjects/unlink": "unlink",
                                  "/api/v1/document-validity": "validity", "/api/v1/document-versions": "replace",
                                  "/api/v1/document-reviews": "review", "/api/v1/document-archives": "archive"}[path])(inst, iid, b, key)
        if "documents.read" not in inst["scopes"]:
            return self.refuse(403, "forbidden_scope")
        return self.reads(inst, path, q)

    def create(self, inst, iid, b, key):
        if not key:
            return self.refuse(400, "idempotency_key_required")
        if b.get("byte_size", 0) > MAX and "no_size_limit" not in self.product.defects:
            return self.refuse(413, "FILE_TOO_LARGE", LIMIT)
        token = "du1." + uuid.uuid4().hex
        self.product.uploads[token] = {"u": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{inst['org']}/{iid}/{key}")), "org": inst["org"], "inst": iid,
                                       "n": b["byte_size"], "s": b["sha256"], "f": b["filename"]}
        self.product.secrets.add(token)
        return self.reply(201, {"upload_id": token, "expires_at": "2026-11-09T06:00:00.000Z", "max_bytes": MAX, "content_url": "/api/v1/document-uploads/content"})

    def content(self, inst, iid, q):
        P, data = self.product, self.body()
        if len(data) > MAX:
            return self.refuse(413, "payload_too_large", LIMIT)
        c = P.uploads.get(unquote(q.get("upload_id", [""])[0]))
        if not c or ((c["org"] != inst["org"] or c["inst"] != iid) and "cross_org_upload" not in P.defects):
            return self.refuse(404, "NOT_FOUND", "Not found.")
        sha = hashlib.sha256(data).hexdigest()
        if len(data) != c["n"] or sha != c["s"]:
            return self.refuse(422, "checksum_mismatch")
        did = str(uuid.uuid5(uuid.NAMESPACE_URL, c["u"])) if "upload_replay_new_doc" not in P.defects else str(uuid.uuid4())
        d = P.docs.get(did)
        if d:
            if d["sha"] == sha or "no_conflict" in P.defects:
                return self.reply(200, {"document_id": did, "status": "quarantined" if d["status"] == "quarantined" else "received", "replay": True})
            return self.refuse(409, "idempotency_conflict")
        status = "quarantined" if b"/JavaScript" in data else "received"
        P.docs[did] = {"org": inst["org"], "status": status, "received_via": c["inst"], "primary": None, "related": set(), "type": None,
                       "filing_keys": {}, "versions": [str(uuid.uuid4())], "reviews": [], "validity": None, "sha": sha, "archive": None}
        return self.reply(201, {"document_id": did, "status": status, "replay": False})

    def received(self, iid, did):
        d = self.product.docs.get(did)
        staff_ok = "staff_doc_fileable" in self.product.defects and d is not None and d["received_via"] is None
        return d if d and (d["received_via"] == iid or staff_ok) else None

    def file(self, inst, iid, b, key):
        P = self.product
        if not key:
            return self.refuse(400, "idempotency_key_required")
        d = self.received(iid, b.get("document_id"))
        if not d:
            return self.refuse(404, "NOT_FOUND", "Not found.")
        fk = f"ext:{iid}:{key}"
        if fk in d["filing_keys"] and "filing_not_idempotent" not in P.defects:
            return self.reply(200, {**d["filing_keys"][fk], "replay": True})
        if d["status"] == "quarantined" and "quarantine_fileable" not in P.defects:
            return self.refuse(409, "DOCUMENT_QUARANTINED")
        if d["status"] not in AVAILABLE and d["status"] != "quarantined":
            return self.refuse(404, "NOT_FOUND", "Not found.")
        if d["primary"] and d["received_via"] is not None:
            return self.refuse(409, "ALREADY_FILED")
        st, sid = b["primary"]["subject_type"], b["primary"]["subject_id"]
        if not P.subject_visible(inst, sid):
            return self.refuse(404, "NOT_FOUND", "Not found.")
        if TYPES.get(b.get("type_key")) != "standard" and "medical_fileable" not in P.defects:
            return self.refuse(422, "TYPE_NOT_AVAILABLE_EXTERNALLY")
        if any(o is not d and o["primary"] == (st, sid) and o["type"] == b["type_key"] and o["status"] in AVAILABLE for o in P.docs.values()):
            return self.refuse(409, "NEW_VERSION_REQUIRED")
        d.update(primary=(st, sid), type=b["type_key"])
        did = b["document_id"]
        r = {"document_id": did, "filed_document_id": did, "mode": "new_document", "doc_type": b["type_key"]}
        d["filing_keys"][fk] = r
        for c in P.cases.get(did, []):  # resolveEscalatedUploadCase
            c["status"] = "completed"
        return self.reply(201, {**r, "replay": False})

    def visible(self, inst, did):
        d = self.product.docs.get(did)
        return d if d and self.product.doc_visible(inst, d) else None

    def link(self, inst, iid, b, key, op="link"):
        P = self.product
        if not key:
            return self.refuse(400, "idempotency_key_required")
        d = self.visible(inst, b["document_id"])
        if not d or not P.subject_visible(inst, b["subject_id"]):
            return self.refuse(404, "NOT_FOUND", "Not found.")
        if d["primary"] == (b["subject_type"], b["subject_id"]) and "owner_unlinkable" not in P.defects:
            return self.refuse(409, "primary_subject_immutable")
        ref = (b["subject_type"], b["subject_id"])
        if op == "link":
            d["related"].add(ref)
        else:
            d["related"].discard(ref)
            if d["primary"] == ref:
                d["primary"] = None
        return self.reply(200, {"document_id": b["document_id"], "subject_type": ref[0], "subject_id": ref[1], "linked": op == "link"})

    def unlink(self, inst, iid, b, key):
        return self.link(inst, iid, b, key, "unlink")

    def validity(self, inst, iid, b, key):
        if not key:
            return self.refuse(400, "idempotency_key_required")
        if b.get("effective_on") and b.get("expires_on") and b["expires_on"] < b["effective_on"]:
            return self.refuse(400, "VALIDITY_RANGE_INVERTED")
        d = self.visible(inst, b["document_id"])
        if not d:
            return self.refuse(404, "NOT_FOUND", "Not found.")
        if d["versions"][-1] != b["version_id"]:
            return self.refuse(409, "NOT_CURRENT_VERSION")
        new = (b.get("effective_on"), b.get("expires_on"))
        changed = d["validity"] != new or "validity_always_changes" in self.product.defects
        if changed:
            d["validity"] = new
            d["reviews"].append({"kind": "validity", "version_id": b["version_id"], "decision": None, "actor_kind": "application"})
        return self.reply(201 if changed else 200, {"document_id": b["document_id"], "version_id": b["version_id"], "effective_on": new[0], "expires_on": new[1], "changed": changed})

    def replace(self, inst, iid, b, key):
        P = self.product
        if not key:
            return self.refuse(400, "idempotency_key_required")
        if len(b.get("reason") or "") < 10:
            return self.refuse(400, "REASON_REQUIRED")
        up = self.received(iid, b["upload_document_id"])
        if not up:
            return self.refuse(404, "NOT_FOUND", "Not found.")
        fk = f"ext:{iid}:{key}"
        if fk in up["filing_keys"]:
            return self.reply(200, {**up["filing_keys"][fk], "replay": True})
        target = self.visible(inst, b["document_id"])
        if not target:
            return self.refuse(404, "TARGET_NOT_FOUND")
        vid = str(uuid.uuid4())
        target["versions"].append(vid)
        target["validity"] = None
        up["status"] = "superseded"
        r = {"document_id": b["document_id"], "upload_document_id": b["upload_document_id"], "version_id": vid, "version_number": len(target["versions"])}
        up["filing_keys"][fk] = r
        return self.reply(201, {**r, "replay": False})

    def review(self, inst, iid, b, key):
        if not key:
            return self.refuse(400, "idempotency_key_required")
        if b.get("decision") not in ("accepted", "rejected"):
            return self.refuse(400, "invalid_request")
        d = self.visible(inst, b.get("document_id", ""))
        if not d:
            return self.refuse(404, "NOT_FOUND", "Not found.")
        if d["versions"][-1] != b["version_id"]:
            return self.refuse(409, "NOT_CURRENT_VERSION")
        current = next((r["decision"] for r in reversed(d["reviews"]) if r["kind"] == "review" and r["version_id"] == b["version_id"]), None)
        if current == b["decision"]:
            return self.reply(200, {"document_id": b["document_id"], "version_id": b["version_id"], "review_status": current, "replay": True})
        if current and "rereview_allowed" not in self.product.defects:
            return self.refuse(403, "REREVIEW_NOT_AUTHORIZED")
        d["reviews"].append({"kind": "review", "version_id": b["version_id"], "decision": b["decision"],
                             "actor_kind": "application", **({"actor": "qa-shared-actor@example.com"} if "review_names_person" in self.product.defects else {})})
        return self.reply(201, {"document_id": b["document_id"], "version_id": b["version_id"], "review_status": b["decision"], "replay": False})

    def archive(self, inst, iid, b, key):
        P = self.product
        if not key:
            return self.refuse(400, "idempotency_key_required")
        d = P.docs.get(b.get("document_id"))
        ak = f"ext:{iid}:{key}"
        if d and d["archive"] and d["archive"]["key"] == ak and d["org"] == inst["org"]:
            return self.reply(200, {"document_id": b["document_id"], "archived": True, "replay": True})
        if not (self.visible(inst, b["document_id"]) or ("foreign_archive" in P.defects and d and d["org"] != inst["org"])):
            return self.refuse(404, "NOT_FOUND", "Not found.")
        d["archive"] = {"key": ak, "previous": d["status"]}
        d["status"] = "archived"
        return self.reply(201, {"document_id": b["document_id"], "archived": True, "replay": False})

    def reads(self, inst, path, q):
        P = self.product
        if path == "/api/v1/documents":
            sid = (q.get("child_id") or q.get("household_id") or [""])[0]
            before = (q.get("expires_before") or [None])[0]
            rows = []
            for k, d in sorted(P.docs.items()):
                if not P.doc_visible(inst, d) or d["primary"][1] != sid:
                    continue
                if before:
                    exp = (d["validity"] or (None, None))[1]
                    if not exp or (exp > before if "expires_inclusive" in P.defects else exp >= before):
                        continue
                rows.append({"id": k})
            return self.reply(200, {"data": rows, "next_cursor": None, "sync_token": "s"})
        if path == "/api/v1/document-requirements":
            rows = [{"id": str(uuid.uuid4()), "requirement_key": "med", "state": "missing", "restricted": True,
                     **({"label": "Immunization record"} if "requirement_restricted_leaks" in P.defects else {})},
                    {"id": str(uuid.uuid4()), "requirement_key": "enr", "label": "Enrollment", "document_type_key": "enrollment_document",
                     "policy": "required", "state": "satisfied", "blocking": False, "due_on": None, "valid_until": None, "expiring_soon": False,
                     "evidence": {"accepted": [], "pending": [], "expired": []}, "restricted": False}]
            return self.reply(200, {"data": rows, "next_cursor": None, "sync_token": "s"})
        m = re.fullmatch(r"/api/v1/documents/([^/]+)(/history|/reviews)?", path)
        d = P.docs.get(m.group(1)) if m else None
        if not d or not P.doc_visible(inst, d):
            if m and m.group(2):
                return self.reply(200, {"data": [], "next_cursor": None, "sync_token": "s"})
            return self.refuse(404, "not_found", "Document not found.")
        if m.group(2) == "/history":
            return self.reply(200, {"data": [{"id": str(uuid.uuid4()), "document_id": m.group(1), "kind": "committed", "action": "Filed",
                                              "version_number": i + 1, "occurred_at": "2026-11-09T05:00:00.000Z"} for i in range(len(d["versions"]))]})
        if m.group(2) == "/reviews":
            return self.reply(200, {"data": [{"id": str(uuid.uuid4()), "document_id": m.group(1), **r} for r in d["reviews"]]})
        subjects = [{"type": d["primary"][0], "id": d["primary"][1], "role": "primary"}] + [{"type": t, "id": i, "role": "related"} for t, i in sorted(d["related"])]
        return self.reply(200, {"data": {"id": m.group(1), "subjects": subjects, "current_version": {"id": d["versions"][-1], "number": len(d["versions"])},
                                         "valid_until": (d["validity"] or (None, None))[1]}})


class D9WriteDriverTest(unittest.TestCase):
    def start(self, defects=()):
        self.product = Product(defects)
        handler = type("H", (Handler,), {"product": self.product})
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.tmp = tempfile.mkdtemp(prefix="d9w-driver-")
        for p in ("fixture_admin", "cross_org_admin"):
            os.makedirs(os.path.join(self.tmp, "auth", RUN, p))
            with open(os.path.join(self.tmp, "auth", RUN, p, "storage-state.json"), "w") as f:
                json.dump({"cookies": [{"name": "sb-qa", "value": f"{p}-session-0123456789abcdef", "domain": "127.0.0.1"}]}, f)
        self.out = os.path.join(self.tmp, "out")
        os.makedirs(self.out)
        self.transcript = ""

    def tearDown(self):
        if getattr(self, "server", None):
            self.server.shutdown()
            self.server.server_close()
            shutil.rmtree(self.tmp, ignore_errors=True)
            self.server = None

    def drive(self, phase, base=None):
        env = {"PATH": os.environ.get("PATH", ""), "D9_BASE_URL": base or f"http://127.0.0.1:{self.server.server_port}",
               "D9_AUTH_DIR": os.path.join(self.tmp, "auth"), "D9_OUT_DIR": self.out, "D9W_ES_WAIT_S": "1", "D9W_ES_POLL_S": "0.2"}
        r = subprocess.run([sys.executable, "-I", DRIVER, RUN, phase], capture_output=True, text=True, env=env, timeout=180)
        self.transcript += r.stdout + r.stderr
        return r.returncode

    def written(self, name):
        p = os.path.join(self.out, f"{name}.{RUN}.json")
        if not os.path.exists(p):
            sys.stderr.write(f"\n[{name} not written; driver transcript tail]\n{self.transcript[-1500:]}\n")
            return None
        with open(p) as f:
            return json.load(f)

    def results(self):
        return self.written("d9w_hosted_results")

    def failed(self):
        return {(c["case"], c["name"]) for c in self.results()["cases"] if c["pass"] is False}

    def failed_cases(self):
        return {c["case"] for c in self.results()["cases"] if c["pass"] is False}

    def seed_aged(self, installation=None, cases=1):
        """What qa_d9_aged_upload_ensure plus one wake leave behind, and the result file Documents records."""
        tw = installation or self.written("d9w_hosted_fixture_ids")["installations"]["T_W"]["installation_id"]
        self.product.docs[AGED] = {"org": QA_SHARED, "status": "uploaded", "received_via": tw, "primary": None, "related": set(), "type": None,
                                   "filing_keys": {}, "versions": [str(uuid.uuid4())], "reviews": [], "validity": None, "sha": "0" * 64, "archive": None}
        self.product.cases[AGED] = [{"id": str(uuid.uuid4()), "status": "open"} for _ in range(cases)]
        with open(os.path.join(self.out, f"d9w_hosted_aged_upload.{RUN}.json"), "w") as f:
            json.dump({"document_id": AGED, "received_via_installation": tw}, f)

    def assert_no_secret_anywhere(self):
        files = ""
        for name in os.listdir(self.out):
            with open(os.path.join(self.out, name)) as f:
                files += f.read()
        self.assertTrue(self.product.secrets)
        for s in self.product.secrets | {"fixture_admin-session-0123456789abcdef", "cross_org_admin-session-0123456789abcdef"}:
            self.assertNotIn(s, self.transcript)
            self.assertNotIn(s, files)

    def assert_access_closed(self):
        self.assertTrue(self.product.inst)
        for i in self.product.inst.values():
            self.assertEqual(i["state"], "revoked")
            for c in i["creds"]:
                self.assertEqual(self.product.creds[c]["status"], "revoked")

    def full(self, defects=(), aged=True, expect=0):
        self.start(defects)
        self.assertEqual(self.drive("preflight"), 0, self.transcript)
        self.assertEqual(self.drive("install"), 0, self.transcript)
        if aged:
            self.seed_aged()
        self.assertEqual(self.drive("docs"), 0, self.transcript)
        self.assertEqual(self.drive("certify"), expect, self.transcript)
        return self.results()

    def test_conforming_product_passes_every_case_and_leaves_nothing_active(self):
        res = self.full()
        self.assertEqual(res["verdict"], "INCOMPLETE", [c for c in res["cases"] if c["pass"] is False])  # second wake: not_run
        self.assertEqual(res["failed"], 0)
        self.assertIsNone(res["stop"])
        ran = {c["case"] for c in res["cases"] if c["pass"] is True}
        self.assertEqual(ran, {"W-S1", "W-U1", "W-U2", "W-U3", "W-U4", "W-U5", "W-F1", "W-F2", "W-F3", "W-F4", "W-L1", "W-V1", "W-R1",
                               "W-RV1", "W-RQ1", "W-AR", "W-AR2", "W-ES"})
        self.assertEqual([c["name"] for c in res["cases"] if c.get("outcome") == "not_run"], ["a second wake adds nothing"])
        self.assertEqual([c["case"] for c in res["cases"] if c.get("outcome") == "deferred"], ["W-C1"])
        self.assertEqual(self.product.cases[AGED][0]["status"], "completed")
        self.assert_access_closed()
        ids = self.written("d9w_hosted_fixture_ids")
        self.assertEqual(set(ids["installations"]), {"T_W", "T_WB", "T_WL", "T_R", "T_A"})
        self.assertEqual(len(ids["installations"]["T_W"]["credential_ids"]), 2)  # install's and certify's, both revoked
        for row in ids["installations"].values():
            self.assertLessEqual(set(row), {"installation_id", "credential_ids", "token_exp", "persona", "credential_revoke_status", "disconnect_status"})
        self.assert_no_secret_anywhere()

    def test_install_leaves_T_W_with_exactly_one_active_credential_and_nothing_written_secret(self):
        self.start()
        self.drive("preflight")
        self.assertEqual(self.drive("install"), 0, self.transcript)
        tw = self.written("d9w_hosted_fixture_ids")["installations"]["T_W"]["installation_id"]
        live = [c for c in self.product.inst[tw]["creds"] if self.product.creds[c]["status"] == "active"]
        self.assertEqual(len(live), 1)  # what qa_d9_aged_upload_ensure.sql requires
        self.assertEqual(sum(1 for i in self.product.inst.values() if i["state"] == "active"), 5)
        self.assertEqual(self.drive("install"), 1, "install refuses a second time for one run")
        self.assert_no_secret_anywhere()
        self.assertEqual(self.drive("cleanup"), 0, self.transcript)  # no documents yet; cleanup closes the installations
        self.assert_access_closed()

    def test_install_failure_part_way_closes_what_it_created(self):
        self.start({"install_refused_T_R"})
        self.drive("preflight")
        self.assertEqual(self.drive("install"), 1)
        self.assertIn("install STOP", self.transcript)
        self.assertEqual(len(self.product.inst), 3)  # T_W, T_WB, T_WL; T_R refused, T_A never reached
        self.assert_access_closed()

    def test_certify_without_install_creates_its_own_installations(self):
        self.start()
        self.drive("preflight"), self.drive("docs")
        self.assertEqual(self.drive("certify"), 0, self.transcript)
        res = self.results()
        self.assertEqual(res["verdict"], "INCOMPLETE")
        self.assertEqual([c["why"] for c in res["cases"] if c["case"] == "W-ES"][0][:len("d9w_hosted_aged_upload")], "d9w_hosted_aged_upload")
        self.assert_access_closed()

    def test_idle_wake_clock_is_not_run_never_a_failure(self):
        self.start()
        self.drive("preflight"), self.drive("install")
        self.seed_aged(cases=0)
        self.drive("docs")
        self.assertEqual(self.drive("certify"), 0, self.transcript)
        res = self.results()
        es = [c for c in res["cases"] if c["case"] == "W-ES"]
        self.assertTrue(all(c["pass"] is None and c["outcome"] == "not_run" for c in es), es)
        self.assertIn("wake clock may be idle", es[0]["why"])
        self.assertEqual(res["verdict"], "INCOMPLETE")

    def test_two_escalation_cases_fail_W_ES(self):
        self.start()
        self.drive("preflight"), self.drive("install")
        self.seed_aged(cases=2)
        self.drive("docs")
        self.assertEqual(self.drive("certify"), 1)
        self.assertIn(("W-ES", "exactly one open Processing case for the aged upload"), self.failed())
        self.assert_access_closed()

    def test_aged_upload_from_another_installation_cannot_be_late_filed(self):
        self.start()
        self.drive("preflight"), self.drive("install")
        self.seed_aged(installation=str(uuid.uuid4()))
        self.drive("docs")
        self.assertEqual(self.drive("certify"), 0, self.transcript)
        es = {c["name"]: c for c in self.results()["cases"] if c["case"] == "W-ES"}
        self.assertTrue(es["exactly one open Processing case for the aged upload"]["pass"])
        self.assertEqual(es["late filing closes the case"]["outcome"], "not_run")

    def test_each_defect_fails_the_case_that_names_it(self):
        for defect, case, stop in (("scope_leak", "W-S1", True), ("upload_replay_new_doc", "W-U1", False), ("no_conflict", "W-U2", False),
                                   ("no_size_limit", "W-U3", False), ("quarantine_fileable", "W-U4", True), ("cross_org_upload", "W-U5", True),
                                   ("filing_not_idempotent", "W-F2", False), ("medical_fileable", "W-F3", True), ("boundary_leak_write", "W-F3", True),
                                   ("staff_doc_fileable", "W-F4", True), ("owner_unlinkable", "W-L1", False), ("validity_always_changes", "W-V1", False),
                                   ("rereview_allowed", "W-RV1", True), ("review_names_person", "W-RV1", False), ("expires_inclusive", "W-RQ1", False),
                                   ("requirement_restricted_leaks", "W-RQ1", False), ("archive_still_listed", "W-AR", False),
                                   ("foreign_archive", "W-AR", True), ("restore_broken", "W-AR2", False)):
            with self.subTest(defect=defect):
                res = self.full({defect}, expect=1)
                self.assertEqual(res["verdict"], "FAIL", defect)
                self.assertIn(case, self.failed_cases(), defect)
                if stop:
                    self.assertIn("security stop", res["stop"] or "", defect)
                self.assert_access_closed()
                self.tearDown()

    def test_a_secret_reflected_into_output_stops_before_writing_and_access_still_closes(self):
        self.start({"echo_token"})
        self.drive("preflight"), self.drive("install"), self.drive("docs")
        self.assertEqual(self.drive("certify"), 3)
        self.assertIsNone(self.written("d9w_hosted_results"))
        self.assertIn("SECURITY STOP", self.transcript)
        self.assert_access_closed()
        self.assert_no_secret_anywhere()

    def test_cleanup_reports_what_the_staff_delete_cannot_prove_gone(self):
        """The staff delete cannot see an unfiled, quarantined or superseded API upload: those are RESIDUE, never CLEAN."""
        self.full()
        self.assertEqual(self.drive("cleanup"), 1, self.transcript)
        reset = self.written("d9w_hosted_reset_results")
        self.assertEqual(reset["verdict"], "RESIDUE")
        left = {r.split()[1] for r in reset["remaining"]}
        self.assertEqual(left, {"U4", "UR", "AGED"})  # quarantined, superseded, and the completed-case aged upload
        gone = {d["key"] for d in reset["documents"] if d.get("delete") == 200}
        self.assertEqual(gone, {"D_STAFF", "U1", "U5", "UL"})
        self.assertEqual(self.drive("cleanup"), 1, "cleanup is idempotent: deleted stays deleted, residue stays listed")
        again = self.written("d9w_hosted_reset_results")
        self.assertEqual({d["key"] for d in again["documents"] if d.get("delete") == "already"}, gone)
        self.assert_access_closed()

    def test_preflight_stops_on_an_installed_application_or_missing_review_operation(self):
        for defect in ("openapi_no_review", "preinstalled"):
            with self.subTest(defect=defect):
                self.start({defect})
                if defect == "preinstalled":
                    self.product.inst["pre"] = {"app": self.product.apps["d9-documents-review-cert"], "org": QA_SHARED, "scopes": [], "boundary": "org_wide",
                                                "locations": [], "state": "active", "creds": []}
                self.assertEqual(self.drive("preflight"), 1)
                self.assertEqual(self.drive("install"), 1, "install refuses without a READY preflight")
                self.assertEqual(self.drive("docs"), 1)
                self.tearDown()

    def test_only_staging_or_loopback(self):
        self.start()
        self.assertNotEqual(self.drive("preflight", base="https://example.com"), 0)
        self.assertIn("refused", self.transcript)


if __name__ == "__main__":
    unittest.main()
