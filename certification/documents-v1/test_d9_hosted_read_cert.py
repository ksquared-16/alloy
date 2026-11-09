"""Local proof of d9_hosted_read_cert.py (the documents_d9_read_v1 consumer driver). No network, no database.

The driver runs as a subprocess against a loopback synthetic product: an in-memory model of the D9.1 read authority
(org binding, scope, locations boundary, primary owner, sensitivity, quarantine, version-current, audited link) and of
the Integrations admin routes. A conforming product must pass every case and leave nothing active. Each defect must turn
the driver's verdict to FAIL, and access must still be closed. A secret must never reach stdout, stderr or a file.

    python3 -I certification/documents-v1/test_d9_hosted_read_cert.py -v   (from the repository root)
"""
import base64, datetime, json, os, re, shutil, subprocess, sys, tempfile, threading, time, unittest, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
DRIVER = os.path.join(HERE, "d9_hosted_read_cert.py")
RUN = "qar_00000000d9a1"
QA_SHARED, QA_SECONDARY = "4acc9386-c485-486f-aa1f-05d83499d142", "ad53fee2-2570-460f-9300-f0e106c473b6"
NORTH, SOUTH, SEC_SITE = "21c9be10-f6e9-4048-ab4c-939ddbe0f0b7", "cfb73302-3bbe-49db-b173-876fda776a6d", "4f89f324-dbc5-4815-8431-38ffec891398"
H1, G1, E1 = "d9000000-0000-4000-8000-000000000101", "d9000000-0000-4000-8000-000000000111", "d9000000-0000-4000-8000-000000000112"
C1, C2, CB = "d9000000-0000-4000-8000-000000000121", "d9000000-0000-4000-8000-000000000122", "d9000000-0000-4000-8000-000000000221"
CHILD_SITE = {C1: NORTH, C2: SOUTH, CB: SEC_SITE}
ORG_OF = {C1: QA_SHARED, C2: QA_SHARED, H1: QA_SHARED, G1: QA_SHARED, E1: QA_SHARED, CB: QA_SECONDARY}
PERSONA_ORG = {"fixture_admin": QA_SHARED, "cross_org_admin": QA_SECONDARY}
HEAD = subprocess.run(["git", "-C", HERE, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()


class Product:
    def __init__(self, defects=()):
        self.defects = set(defects)
        self.apps = {"d9-documents-read-cert": str(uuid.uuid4()), "d9-documents-scope-cert": str(uuid.uuid4()), "alloy-cert-sandbox": str(uuid.uuid4())}
        self.inst, self.creds, self.tokens, self.docs = {}, {}, {}, {}
        self.secrets = set()
        # workflow_events document_link_issued, per document: what the staff history reads (documentHistory.ts).
        self.link_events, self.late_audits = {}, []

    def audit_link(self, did):
        self.link_events.setdefault(did, []).append(datetime.datetime.now(datetime.timezone.utc).isoformat())

    # the D9.1 read authority
    def visible(self, inst, doc):
        if "cross_org" in self.defects and doc["org"] != inst["org"] and doc["sensitivity"] == "standard" and not doc["quarantined"]:
            return True
        if doc["org"] != inst["org"] or doc["sensitivity"] != "standard" or doc["quarantined"] or doc["doc_type"] == "immunization_record":
            return "leak_held" in self.defects and doc["sensitivity"] == "personal_identity"
        return self.subject_visible(inst, doc["entity_id"])

    def subject_visible(self, inst, sid):
        if ORG_OF.get(sid) != inst["org"]:
            return False
        child_ok = lambda c: inst["boundary"] == "org_wide" or CHILD_SITE[c] in inst["locations"] or "boundary_leak" in self.defects
        if sid in CHILD_SITE:
            return child_ok(sid)
        if sid in (H1, G1) or (sid == E1 and "emergency_contact_is_guardian" in self.defects):
            return child_ok(C1)
        return False  # E1: an emergency contact is never a guardian


class Handler(BaseHTTPRequestHandler):
    product = None

    def log_message(self, *a):
        pass

    def server_now(self):
        """The product's clock. qar_143a8fbcad49 showed staging's leading the driver host's."""
        return time.time() + (5.0 if "server_clock_ahead" in self.product.defects else 0.0)

    def date_time_string(self, timestamp=None):
        return super().date_time_string(self.server_now() if timestamp is None else timestamp)

    def reply(self, status, body, headers=None):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(raw)

    def persona(self):
        m = re.search(r"sb-qa=([a-z_]+)-session", self.headers.get("cookie", ""))
        return m.group(1) if m else None

    def body(self):
        # Read once, before any reply: a reply that leaves request bytes unread makes the socket close with a reset,
        # which the driver saw as ConnectionResetError (an intermittent harness failure, not a product behaviour).
        if not hasattr(self, "_body"):
            n = int(self.headers.get("content-length") or 0)
            self._body = self.rfile.read(n) if n else b""
        return self._body

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PATCH(self):
        self.route("PATCH")

    def do_DELETE(self):
        self.route("DELETE")

    def route(self, method):
        self.body()
        P, u = self.product, urlparse(self.path)
        path, q = u.path, parse_qs(u.query)
        if path == "/api/build-info":
            return self.reply(200, {"gitSha": HEAD})
        if path.startswith("/api/v1/"):
            return self.v1(method, path, q)
        who = self.persona()
        if not who:
            return self.reply(401, {"error": "Unauthorized"})
        org = PERSONA_ORG[who]
        if path == "/api/admin/integrations/applications":
            # listApprovedApplications at 5db26b46 (PR #1637): only a non-revoked installation holds the slot.
            have = {i["app"] for i in P.inst.values() if i["org"] == org and i["state"] != "revoked"}
            return self.reply(200, {"applications": [{"id": i, "slug": s, "status": "active", "alreadyInstalled": i in have} for s, i in P.apps.items()]})
        if path == "/api/admin/integrations/installations" and method == "GET":
            slug = {i: s for s, i in P.apps.items()}
            rows = [{"id": k, "applicationSlug": slug[i["app"]], "state": i["state"],
                     "credential": ({"id": i["cred"], "status": P.creds[i["cred"]]["status"]} if i["cred"] else None)}
                    for k, i in P.inst.items() if i["org"] == org]
            return self.reply(200, {"installations": rows})
        if path == "/api/admin/integrations/installations" and method == "POST":
            b = json.loads(self.body())
            if any(i["app"] == b["applicationId"] and i["org"] == org and i["state"] != "revoked" for i in P.inst.values()):
                return self.reply(409, {"error": "already connected"})
            iid = str(uuid.uuid4())
            P.inst[iid] = {"app": b["applicationId"], "org": org, "scopes": b["grantedScopes"], "boundary": b["boundaryMode"],
                           "locations": b.get("locationIds", []), "state": "active", "cred": None}
            return self.reply(201, {"installationId": iid})
        m = re.fullmatch(r"/api/admin/integrations/installations/([^/]+)(/credentials(?:/([^/]+))?)?", path)
        if m:
            iid, cred_path, cid = m.groups()
            inst = P.inst.get(iid)
            if not inst or inst["org"] != org:
                return self.reply(404, {"error": "not found"})
            if cred_path and method == "POST":
                cid, secret, client = str(uuid.uuid4()), "sk_" + uuid.uuid4().hex, "cl_" + uuid.uuid4().hex
                P.creds[cid] = {"inst": iid, "secret": secret, "client": client, "status": "active"}
                P.secrets.add(secret)
                inst["cred"] = cid
                return self.reply(201, {"credentialId": cid, "clientId": client, "clientSecret": secret, "shownOnce": True})
            if cred_path and method == "DELETE":
                P.creds[cid]["status"] = "revoked"
                return self.reply(200, {"revoked": True})
            if method == "PATCH":
                inst["state"] = json.loads(self.body())["state"]
                return self.reply(200, {"ok": True})
        if path == "/api/admin/documents/upload":
            raw = self.body()
            f = dict(re.findall(rb'name="(\w+)"\r\n\r\n([^\r]*)\r\n', raw))
            did = str(uuid.uuid4())
            js = b"/JavaScript" in raw
            P.docs[did] = {"org": org, "entity_id": f[b"entity_id"].decode(), "doc_type": f[b"doc_type"].decode(),
                           "sensitivity": "standard", "quarantined": js, "version": 1}
            return self.reply(200, {"document": {"id": did}, **({"screening": {"verdict": "quarantine"}} if js else {})})
        m = re.fullmatch(r"/api/admin/documents/([^/]+)/history", path)
        if m and method == "GET":
            # GET /api/admin/documents/{id}/history at d93d6e17: {ok, document_id, entries}; a link issuance is kind "access".
            doc = P.docs.get(m.group(1))
            if not doc or doc["org"] != org:
                return self.reply(404, {"ok": False, "error": "Not found"})
            entries = [{"at": doc.get("created_at", ""), "kind": "committed", "action": "Uploaded", "detail": None, "version_number": 1}]
            entries += [{"at": at, "kind": "access", "action": "Download link issued", "detail": None, "version_number": None} for at in P.link_events.get(m.group(1), [])]
            return self.reply(200, {"ok": True, "document_id": m.group(1), "entries": entries})
        m = re.fullmatch(r"/api/admin/documents/([^/]+)/(sensitivity|versions)", path)
        if m:
            doc = P.docs[m.group(1)]
            if m.group(2) == "sensitivity":
                doc["sensitivity"] = json.loads(self.body())["sensitivity"]
                return self.reply(200, {"sensitivity": doc["sensitivity"]})
            self.body()
            doc["version"] += 1
            return self.reply(201, {"ok": True})
        m = re.fullmatch(r"/api/admin/pos/documents/([^/]+)", path)
        if m and method == "DELETE":
            if m.group(1) in P.docs and P.docs[m.group(1)]["org"] == org:
                del P.docs[m.group(1)]
                return self.reply(200, {"data": {"deleted": True}})
            return self.reply(404, {"error": "Not found"})
        return self.reply(404, {"error": f"no route {method} {path}"})

    def v1(self, method, path, q):
        P = self.product
        if path == "/api/v1/oauth/token":
            b = json.loads(self.body())
            c = next((c for c in P.creds.values() if c["client"] == b.get("client_id") and c["secret"] == b.get("client_secret") and c["status"] == "active"), None)
            if not c or ("token_refused_T_L" in P.defects and P.inst[c["inst"]]["boundary"] == "locations"):
                return self.reply(401, {"error": {"code": "invalid_client", "type": "invalid_request"}})
            t = "at_" + uuid.uuid4().hex
            P.tokens[t] = c["inst"]
            P.secrets.add(t)
            return self.reply(200, {"access_token": t, "token_type": "Bearer", "expires_in": 900})
        while P.late_audits:
            P.audit_link(P.late_audits.pop())
        t = (self.headers.get("authorization") or "")[7:]
        inst = P.inst.get(P.tokens.get(t, ""))
        rid = str(uuid.uuid4())
        if not inst or inst["state"] != "active" or P.creds[inst["cred"]]["status"] != "active":
            return self.reply(401, {"error": {"code": "invalid_credential", "type": "unauthenticated", "request_id": rid}})
        if "documents.read" not in inst["scopes"]:
            code = t if "echo_token" in P.defects else "insufficient_scope"
            return self.reply(403, {"error": {"code": code, "type": "forbidden_scope", "request_id": rid}})
        nf = lambda: self.reply(404, {"error": {"code": "not_found", "type": "not_found", "message": "Document not found.", "request_id": rid}}, {"x-request-id": rid})
        # toPublicDocument (documentResources.ts at d93d6e17): the full allow-listed field set, nothing else.
        pub = lambda k, d: {"id": k, "title": "t", "type": {"key": d["doc_type"], "label": None}, "category_path": [],
                            "subjects": [{"type": "child" if d["entity_id"] in CHILD_SITE else "household" if d["entity_id"] == H1 else "person", "id": d["entity_id"], "role": "primary"}],
                            "current_version": {"id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{k}/{d['version']}")), "number": d["version"], "content_type": "application/pdf", "size_bytes": 512, "received_at": "2026-11-08T17:23:00.000Z"},
                            "review_status": None, "valid_until": None, "updated_at": "2026-11-08T17:23:00.000Z"}
        if path == "/api/v1/document-categories":
            return self.reply(200, {"data": [{"key": "general", "parent_key": None}], "next_cursor": None, "sync_token": "s"})
        if path == "/api/v1/documents":
            given = [(k, q[k][0]) for k in ("child_id", "household_id", "person_id") if k in q]
            if len(given) != 1:
                return self.reply(400, {"error": {"code": "subject_filter_required", "type": "invalid_request", "request_id": rid}})
            sid = given[0][1]
            rows = sorted(k for k, d in P.docs.items() if d["entity_id"] == sid and P.visible(inst, d)) if P.subject_visible(inst, sid) else []
            start, limit = int(q.get("cursor", ["0"])[0]), int(q.get("limit", ["50"])[0])
            page = rows[start:start + limit]
            more = start + limit < len(rows)
            return self.reply(200, {"data": [pub(k, P.docs[k]) for k in page], "next_cursor": str(start + limit) if more else None, "sync_token": "s"})
        m = re.fullmatch(r"/api/v1/documents/([^/]+)(/download-link)?", path)
        if m:
            d = P.docs.get(m.group(1))
            if not d or not P.visible(inst, d):
                if m.group(2) and "audit_refused_link" in P.defects and d:
                    P.audit_link(m.group(1))
                return nf()
            # singleResourceThroughCollection (documentResources.ts:94 at d93d6e17): one resource answers {"data": {...}}.
            one = (lambda body: body) if "flat_single_resource" in P.defects else (lambda body: {"data": body})
            if m.group(2):
                # externalDocumentDownloadSource: createSignedUrl(path, 600), then expires_at = issuedAt + 600 on the
                # function's clock. Storage's token carries iat/exp on Storage's clock.
                srv = self.server_now()
                declared = 3600 if {"long_link", "long_declared"} & P.defects else 600
                enforced = 3600 if {"long_link", "long_token"} & P.defects else 600
                exp = datetime.datetime.fromtimestamp(srv + declared, datetime.timezone.utc).isoformat()
                b64 = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
                token = ".".join([b64({"alg": "HS256", "typ": "JWT"}), b64({"url": f"documents/{uuid.uuid4().hex}", "iat": int(srv), "exp": int(srv) + enforced}), uuid.uuid4().hex])
                url = f"https://ikaxilmwmrmbagoidedu.supabase.co/storage/v1/object/sign/x?token={token}"
                P.secrets.add(url)
                # externalDocumentDownloadSource: recordDocumentAudit, then createSignedUrl, then the response.
                if "audit_after_response" in P.defects:
                    P.late_audits.append(m.group(1))
                elif "audit_missing" not in P.defects:
                    P.audit_link(m.group(1))
                return self.reply(200, one({"document_id": m.group(1), "url": url, "expires_at": exp}))
            return self.reply(200, one(pub(m.group(1), d)))
        return nf()


class D9DriverTest(unittest.TestCase):
    def start(self, defects=()):
        self.product = Product(defects)
        handler = type("H", (Handler,), {"product": self.product})
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.tmp = tempfile.mkdtemp(prefix="d9-driver-")
        for p in ("fixture_admin", "cross_org_admin"):
            os.makedirs(os.path.join(self.tmp, "auth", RUN, p))
            with open(os.path.join(self.tmp, "auth", RUN, p, "storage-state.json"), "w") as f:
                json.dump({"cookies": [{"name": "sb-qa", "value": f"{p}-session-0123456789abcdef", "domain": "127.0.0.1"}]}, f)
        self.out = os.path.join(self.tmp, "out")
        os.makedirs(self.out)
        self.transcript = ""

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def drive(self, phase, base=None):
        env = {"PATH": os.environ.get("PATH", ""), "D9_BASE_URL": base or f"http://127.0.0.1:{self.server.server_port}",
               "D9_AUTH_DIR": os.path.join(self.tmp, "auth"), "D9_OUT_DIR": self.out}
        r = subprocess.run([sys.executable, "-I", DRIVER, RUN, phase], capture_output=True, text=True, env=env, timeout=120)
        self.transcript += r.stdout + r.stderr
        return r.returncode

    def written(self, name):
        p = os.path.join(self.out, f"{name}.{RUN}.json")
        if not os.path.exists(p):
            sys.stderr.write(f"\n[{name} not written; driver transcript tail]\n{self.transcript[-1500:]}\n")
            return None
        with open(p) as f:
            return json.load(f)

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
            self.assertEqual(self.product.creds[i["cred"]]["status"], "revoked")

    def test_conforming_product_passes_and_leaves_nothing_active(self):
        self.start()
        self.assertEqual(self.drive("preflight"), 0, self.transcript)
        self.assertEqual(self.drive("docs"), 0, self.transcript)
        self.assertEqual(self.drive("certify"), 0, self.transcript)
        res = self.written("d9r_hosted_results")
        self.assertEqual(res["verdict"], "PASS", [c for c in res["cases"] if not c["pass"]])
        self.assertEqual(sorted({c["case"] for c in res["cases"]}), list(range(1, 15)))
        c11 = [c for c in res["cases"] if c["case"] == 11]
        self.assertEqual([(c["as"], c["links_issued_before"], c["links_issued_after"]) for c in c11], [("T_B", 0, 0), ("T_A", 0, 1), ("T_A", 1, 2)])
        self.assert_access_closed()
        self.assertEqual(self.drive("cleanup"), 0, self.transcript)
        self.assertEqual(self.written("d9r_hosted_reset_results")["verdict"], "CLEAN")
        self.assertEqual(self.product.docs, {})
        ids = self.written("d9r_hosted_fixture_ids")
        self.assertEqual(set(ids["installations"]), {"T_A", "T_B", "T_L", "T_N"})
        for row in ids["installations"].values():
            self.assertLessEqual(set(row), {"installation_id", "credential_id", "token_exp", "persona", "credential_revoke_status", "disconnect_status"})
        self.assert_no_secret_anywhere()
        self.assertEqual(self.drive("cleanup"), 0, "cleanup is idempotent")

    def test_flat_single_resource_reproduces_exactly_the_hosted_failures(self):
        """qar_7d7ec3d86bdd: the driver read detail and link bodies flat; staging answers {"data": {...}}. Against a flat
        product the fixed driver must still FAIL those five, and nothing else: the envelope is required, not tolerated."""
        self.start({"flat_single_resource"})
        self.drive("preflight"), self.drive("docs")
        self.assertEqual(self.drive("certify"), 1)
        res = self.written("d9r_hosted_results")
        failed = sorted((c["case"], c.get("call_index", 0)) for c in res["cases"] if not c["pass"])
        self.assertEqual(failed, [(6, 0), (10, 1), (10, 2), (12, 0), (14, 0)])
        self.assertIsNone(res["stop"])
        self.assert_access_closed()

    def test_case_11_ordering_defects_fail_case_11(self):
        for defect, who in (("audit_after_response", "T_A"), ("audit_missing", "T_A"), ("audit_refused_link", "T_B")):
            with self.subTest(defect=defect):
                self.start({defect})
                self.drive("preflight"), self.drive("docs")
                self.assertEqual(self.drive("certify"), 1, defect)
                res = self.written("d9r_hosted_results")
                bad = {(c["case"], c["as"]) for c in res["cases"] if not c["pass"]}
                self.assertIn((11, who), bad, defect)
                self.assert_access_closed()
                self.tearDown()

    def test_held_document_returned_is_a_security_stop_and_access_still_closes(self):
        self.start({"leak_held"})
        self.drive("preflight"), self.drive("docs")
        self.assertEqual(self.drive("certify"), 1)
        res = self.written("d9r_hosted_results")
        self.assertEqual(res["verdict"], "FAIL")
        self.assertIn("security stop", res["stop"])
        self.assert_access_closed()
        self.assert_no_secret_anywhere()

    def test_each_authority_defect_fails_the_case_that_names_it(self):
        for defect, case in (("boundary_leak", 9), ("cross_org", 8), ("emergency_contact_is_guardian", 5), ("long_link", 10),
                             ("long_token", 10), ("long_declared", 10)):
            with self.subTest(defect=defect):
                self.start({defect})
                self.drive("preflight"), self.drive("docs")
                self.assertEqual(self.drive("certify"), 1, defect)
                res = self.written("d9r_hosted_results")
                self.assertEqual(res["verdict"], "FAIL")
                self.assertIn(case, {c["case"] for c in res["cases"] if not c["pass"]}, defect)
                self.assert_access_closed()
                self.tearDown()

    def test_server_clock_ahead_passes_case_10_and_reproduces_the_hosted_reading(self):
        """qar_143a8fbcad49: a correct 600 s link measured 600.13 / 600.27 s on the driver host's clock because staging's
        clock leads. Measured on one clock each, the same link passes; this host's reading is kept, and decides nothing."""
        self.start({"server_clock_ahead"})
        self.drive("preflight"), self.drive("docs")
        self.assertEqual(self.drive("certify"), 0, self.transcript)
        c10 = [c for c in self.written("d9r_hosted_results")["cases"] if c["case"] == 10]
        self.assertEqual(len(c10), 2)
        for c in c10:
            self.assertTrue(c["pass"], c)
            self.assertEqual(c["ttl_enforced_s"], 600)
            self.assertGreater(c["ttl_host_clock_s"], 600)
            self.assertLessEqual(c["ttl_declared_s"], 602)
        self.assert_no_secret_anywhere()

    def test_an_overlong_link_fails_case_10_whichever_clock_carries_it(self):
        """The regression the skew fix must not lose: a 3600 s link fails whether Storage enforces it or the API declares
        it, and with the server clock leading as on staging."""
        for defects in ({"long_token"}, {"long_declared"}, {"long_token", "server_clock_ahead"}, {"long_declared", "server_clock_ahead"}):
            with self.subTest(defects=sorted(defects)):
                self.start(defects)
                self.drive("preflight"), self.drive("docs")
                self.assertEqual(self.drive("certify"), 1, defects)
                res = self.written("d9r_hosted_results")
                failed = sorted((c["case"], c.get("call_index", 0)) for c in res["cases"] if not c["pass"])
                self.assertEqual(failed, [(10, 1), (10, 2)], defects)
                self.assert_access_closed()
                self.tearDown()

    def test_setup_failure_part_way_closes_what_was_opened(self):
        self.start({"token_refused_T_L"})
        self.drive("preflight"), self.drive("docs")
        self.assertEqual(self.drive("certify"), 1)
        self.assertIn("setup stop", self.written("d9r_hosted_results")["stop"])
        self.assertEqual(len(self.product.inst), 3)  # T_A, T_B, T_L created; T_N never
        self.assert_access_closed()

    def test_a_secret_reflected_into_output_stops_before_writing_and_access_still_closes(self):
        self.start({"echo_token"})
        self.drive("preflight"), self.drive("docs")
        self.assertEqual(self.drive("certify"), 3)
        self.assertIsNone(self.written("d9r_hosted_results"))
        self.assertIn("SECURITY STOP", self.transcript)
        self.assert_access_closed()
        self.assert_no_secret_anywhere()

    def test_cleanup_closes_access_left_by_an_interrupted_certify(self):
        self.start()
        self.drive("preflight"), self.drive("docs")
        app = self.product.apps["d9-documents-read-cert"]
        cid = str(uuid.uuid4())
        self.product.inst["left"] = {"app": app, "org": QA_SHARED, "scopes": ["documents.read"], "boundary": "org_wide", "locations": [], "state": "active", "cred": cid}
        self.product.creds[cid] = {"inst": "left", "secret": "sk_x", "client": "cl_x", "status": "active"}
        self.assertEqual(self.drive("cleanup"), 0, self.transcript)
        self.assert_access_closed()
        self.assertEqual(self.product.docs, {})

    def test_preflight_stops_when_an_application_is_already_installed(self):
        self.start()
        self.product.inst["pre"] = {"app": self.product.apps["d9-documents-scope-cert"], "org": QA_SECONDARY, "scopes": [], "boundary": "org_wide",
                                    "locations": [], "state": "active", "cred": None}
        self.assertEqual(self.drive("preflight"), 1)
        self.assertEqual(self.drive("docs"), 1, "docs refuses without a READY preflight")
        self.assertEqual(self.product.docs, {})

    def test_a_revoked_prior_installation_does_not_block_a_rerun(self):
        """qar_31100f9d04e5 stopped at preflight on qar_7d7ec3d86bdd's revoked installations; PR #1637 frees the slot."""
        self.start()
        cid = str(uuid.uuid4())
        self.product.inst["old"] = {"app": self.product.apps["d9-documents-read-cert"], "org": QA_SHARED, "scopes": [], "boundary": "org_wide",
                                    "locations": [], "state": "revoked", "cred": cid}
        self.product.creds[cid] = {"inst": "old", "secret": "sk_old", "client": "cl_old", "status": "revoked"}
        self.assertEqual(self.drive("preflight"), 0, self.transcript)
        self.drive("docs")
        self.assertEqual(self.drive("certify"), 0, self.transcript)
        self.assertEqual(self.product.inst["old"]["state"], "revoked")
        self.assert_access_closed()

    def test_only_staging_or_loopback(self):
        self.start()
        self.assertNotEqual(self.drive("preflight", base="https://example.com"), 0)
        self.assertIn("refused", self.transcript)


class HostedRunRecordTest(unittest.TestCase):
    def test_hosted_run_qar_7d7ec3d86bdd_stays_recorded_as_run(self):
        """The receipt of the hosted run is evidence, not a fixture: 35 passed, 5 failed, the five named, verdict FAIL."""
        with open(os.path.join(HERE, "d9r_hosted_results.qar_7d7ec3d86bdd.json")) as f:
            res = json.load(f)
        self.assertEqual((res["passed"], res["failed"], res["verdict"], res["stop"]), (35, 5, "FAIL", None))
        failed = sorted((c["case"], c.get("call_index", 0)) for c in res["cases"] if not c["pass"])
        self.assertEqual(failed, [(6, 0), (10, 1), (10, 2), (12, 0), (14, 0)])
        self.assertTrue(res["close"]["all_closed"])

    def test_hosted_run_qar_143a8fbcad49_stays_recorded_as_run(self):
        """Rerun 2 under driver bfed4a96: 41 passed, 2 failed (case 10 x2 on the cross-clock ttl bound). Evidence, not a fixture."""
        with open(os.path.join(HERE, "d9r_hosted_results.qar_143a8fbcad49.json")) as f:
            res = json.load(f)
        self.assertEqual((res["passed"], res["failed"], res["verdict"], res["stop"]), (41, 2, "FAIL", None))
        failed = sorted((c["case"], c.get("call_index", 0)) for c in res["cases"] if not c["pass"])
        self.assertEqual(failed, [(10, 1), (10, 2)])
        self.assertEqual([round(c["ttl_seconds"], 2) for c in res["cases"] if c["case"] == 10], [600.13, 600.27])
        self.assertTrue(res["close"]["all_closed"])


if __name__ == "__main__":
    unittest.main()
