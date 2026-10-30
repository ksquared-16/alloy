"""Local proof of the R2 / R5 hosted matrix in r4_hosted_restricted_personas_cert.py — no network, no database.

The driver's ensure_r2r5 / certify_r2r5 / reset_r2r5 run against a synthetic product: an in-memory model of the Forms
subject-scope rule (fixture_admin unrestricted, scoped_forms department QA D1 only, cross_org_admin another
organization) and of lead deletion (a child stays while another lead carries it). A conforming product must pass every
case; each defect the matrix exists to catch must turn the case that names it into a FAIL.

    python3 -I -m unittest certification/documents-v1/test_r4_r2r5_matrix.py   (from the repository root)
"""
import copy, importlib.util, json, os, re, unittest
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def load_driver():
    spec = importlib.util.spec_from_file_location("r4_driver_under_test", os.path.join(HERE, "r4_hosted_restricted_personas_cert.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


L1, L2 = "opp-l1", "opp-l2"
HH1, HH2 = "hh-1", "hh-2"
K1, KU = "kid-k1", "kid-ku"
P1, P2 = "person-l1", "person-l2"
FORM, VERSION = "form-1", "ver-1"
D1, D2 = "D1", "D2"


class FakeProduct:
    """The deployed product, reduced to the rules the matrix measures. `defects` switches individual rules off."""

    def __init__(self, sc, defects=()):
        self.sc = sc
        self.defects = set(defects)
        self.n = 0
        self.dept = {L1: D1, L2: D2, sc["lead_a"]: D1, sc["lead_b"]: D1}
        self.member_household = {K1: HH1, KU: HH2, sc["child_shared"]: sc["household"], sc["child_only_a"]: sc["household"]}
        self.opp_household = {L1: HH1, L2: HH2, sc["lead_a"]: sc["household"], sc["lead_b"]: sc["household"]}
        self.ocm = {(sc["lead_a"], sc["child_shared"]), (sc["lead_a"], sc["child_only_a"]), (sc["lead_b"], sc["child_shared"])}
        self.opps = set(self.dept)
        self.members = set(self.member_household)
        self.households = {HH1, HH2, sc["household"]}
        self.subs = {}
        self.sessions = {}
        self.links = {}  # id -> {"subject": (kind, id) | None, "packet": id | None, "form": id | None, "token": str}
        self.packets = set()
        self.seen_tokens = []
        self.person_household = {P1: HH1, P2: HH2}
        self.composed = []

    # ------------------------------------------------------------------ scope
    def dept_of(self, kind, sid):
        if kind == "opportunity":
            return self.dept.get(sid)
        if kind == "customer_member":
            opps = [o for (o, m) in self.ocm if m == sid]
            depts = {self.dept[o] for o in opps if o in self.opps}
            if not depts:  # a child with no lead carrying it: in scope only through its household's lead
                hh = self.member_household.get(sid)
                depts = {self.dept[o] for o, h in self.opp_household.items() if h == hh and o in self.opps}
            return D1 if D1 in depts else (D2 if depts else None)
        return None

    def in_scope(self, persona, subject):
        if persona == "cross_org_admin":
            return False
        if persona == "fixture_admin":
            return True
        if subject is None:
            return True
        if subject[0] != "opportunity":  # production: a child / household / person with no opportunity is unrestricted-only
            return False
        return self.dept_of(*subject) == D1

    AUTHORS = ("fixture_admin", "scoped_author")

    def household_people(self, hh):
        return [p for p, h in self.person_household.items() if h == hh]

    def destination_ok(self, persona, subjects, children=(), recipients=(), roster_opp=None, defect=None):
        """formsDestinationInActorScope: every subject in scope; every child / recipient in the in-scope opp's household."""
        if persona == "fixture_admin" or (defect and defect in self.defects):
            return True
        if not all(self.in_scope(persona, sj) for sj in subjects):
            return False
        if not children and not recipients:
            return True
        if not roster_opp or not self.in_scope(persona, ("opportunity", roster_opp)):
            return False
        hh = self.opp_household.get(roster_opp)
        return all(self.member_household.get(c) == hh for c in children) and all(self.person_household.get(r) == hh for r in recipients)

    def meta_destination(self, meta, launch=None):
        subjects = [launch] if launch else []
        st, sid = (meta.get("source_entity_type") or ""), meta.get("source_entity_id")
        opps = [o for o in (meta.get("opportunity_id"), meta.get("anchor_opportunity_id"), sid if st == "opportunity" else None) if o]
        subjects += [("opportunity", o) for o in opps]
        if sid and st and st != "opportunity":
            subjects.append((st, sid))
        children = [c for c in [meta.get("composer_child_id"), meta.get("selected_customer_member_id"), *(meta.get("selected_customer_member_ids") or [])] if c]
        recipients = [r for r in (meta.get("composer_recipient_id"), meta.get("recipient_person_id")) if r]
        roster = (launch[1] if launch and launch[0] == "opportunity" else None) or (opps[0] if opps else None)
        return subjects, children, recipients, roster

    def link_subject(self, launch, meta):
        if launch:
            return launch
        subjects, children, _, _ = self.meta_destination(meta)
        return subjects[0] if subjects else (("customer_member", children[0]) if children else None)

    def sub_subject(self, s):
        if s.get("opportunity_id"):
            return ("opportunity", s["opportunity_id"])
        if s.get("customer_member_id"):
            return ("customer_member", s["customer_member_id"])
        return None

    def new_id(self, prefix):
        self.n += 1
        return f"{prefix}-{self.n}"

    # ------------------------------------------------------------------ transport
    def call(self, path, persona=None, method="GET", body=None, ctype=None):
        u = urlparse(path)
        p, q = u.path, {k: v[0] for k, v in parse_qs(u.query).items()}
        data = json.loads(body) if body else {}
        nf = (404, {"error": "Not found"})
        m = re.fullmatch(r"/api/public/forms/([^/]+)/resolve", p)
        if m:
            tok = m.group(1)
            self.seen_tokens.append(tok)
            link = next((k for k, v in self.links.items() if v["token"] == tok), None)
            if not link:
                return nf
            sid = self.new_id("ps")
            self.sessions[sid] = {"id": sid, "started_via_public_link_id": link, "subject": self.links[link]["subject"]}
            return 200, {"ok": True}
        if persona is None:
            return 401, {"error": "Unauthorized"}
        if p == "/api/admin/forms/packet-sessions":
            rows = [{"id": s["id"], "started_via_public_link_id": s["started_via_public_link_id"]} for s in self.sessions.values()
                    if persona != "cross_org_admin" and (self.in_scope(persona, s["subject"]) or "session_list_unfiltered" in self.defects)]
            return 200, {"data": rows}
        m = re.fullmatch(r"/api/admin/forms/packet-sessions/([^/]+)(/review-rollup|/review-insight|/review)?", p)
        if m:
            s = self.sessions.get(m.group(1))
            if not s:
                return nf
            if not self.in_scope(persona, s["subject"]):
                if "session_read_capability_403" in self.defects:
                    return 403, {"error": "Forbidden"}
                if "session_read_leaks" in self.defects:
                    return 200, {"data": {"session": s}}
                return nf
            if m.group(2) == "/review":
                return 409, {"error": "Session is not completed"}
            return 200, ({"ok": True, "rollup": {}} if m.group(2) else {"data": {"session": {"id": s["id"]}, "items": []}})
        if p == "/api/admin/forms/packet-definitions" and method == "POST":
            pid = self.new_id("pkt")
            self.packets.add(pid)
            return 201, {"data": {"id": pid}}
        if re.fullmatch(r"/api/admin/forms/packet-definitions/[^/]+/items", p):
            return 200, {"data": [{"id": "item"}]}
        if p == "/api/admin/forms/packet-links":
            le = data.get("launch_from_entity") or {}
            subject = (le["entity_type"], le["entity_id"]) if le else None
            if not self.in_scope(persona, subject):
                return nf
            meta = data.get("metadata") or {}
            sel = data.get("enrollment_selection") or {}
            subjects, children, recipients, roster = self.meta_destination(meta, subject)
            children += [sel["customer_member_id"]] if sel.get("customer_member_id") else []
            recipients += [sel["recipient_person_id"]] if sel.get("recipient_person_id") else []
            if not self.destination_ok(persona, subjects, children, recipients, roster, defect="packet_destination_unchecked"):
                return nf
            if not data.get("packet_definition_id"):
                return 400, {"error": "packet_definition_id required"}
            lid = self.new_id("pl")
            self.links[lid] = {"subject": self.link_subject(subject, meta), "packet": data["packet_definition_id"], "form": None, "token": self.new_id("tok-secret")}
            return 201, {"data": {"id": lid, "plaintext_token": self.links[lid]["token"]}}
        m = re.fullmatch(r"/api/admin/forms/([^/]+)/public-links/([^/]+)", p)
        if m and method == "PATCH":
            if persona not in self.AUTHORS:
                return 403, {"error": "Forbidden"}
            link = self.links.get(m.group(2))
            if not link:
                return nf
            if not self.in_scope(persona, link["subject"]) and "patch_existing_unscoped" not in self.defects:
                return nf
            if "metadata" in data:
                subjects, children, recipients, roster = self.meta_destination(data["metadata"])
                if not self.destination_ok(persona, subjects, children, recipients, roster, defect="link_metadata_unscoped"):
                    return nf
                link["subject"] = self.link_subject(None, data["metadata"]) or link["subject"]
            return 200, {"data": {"id": m.group(2)}}
        m = re.fullmatch(r"/api/admin/forms/([^/]+)/public-links", p) or re.fullmatch(r"/api/admin/forms/packet-definitions/([^/]+)/public-links", p)
        if m:
            owner = m.group(1)
            if method == "POST":
                if persona not in self.AUTHORS:
                    return 403, {"error": "Forbidden"}
                le = data.get("launch_from_entity") or {}
                subject = (le["entity_type"], le["entity_id"]) if le else None
                if subject and not self.in_scope(persona, subject):
                    return nf
                meta = data.get("metadata") or {}
                subjects, children, recipients, roster = self.meta_destination(meta, subject)
                if not self.destination_ok(persona, subjects, children, recipients, roster, defect="link_metadata_unscoped"):
                    return nf
                lid = self.new_id("fl")
                self.links[lid] = {"subject": self.link_subject(subject, meta), "packet": None, "form": owner, "token": self.new_id("tok-secret")}
                return 201, {"data": {"id": lid, "plaintext_token": self.links[lid]["token"]}}
            key = "packet" if "packet-definitions" in p else "form"
            rows = [{"id": k} for k, v in self.links.items() if v[key] == owner
                    and (self.in_scope(persona, v["subject"]) or "link_list_unfiltered" in self.defects)]
            return 200, {"data": rows}
        if p == "/api/admin/pos/packets/roster":
            if persona not in self.AUTHORS:
                return 403, {"error": "Forbidden"}
            t, eid = q.get("entity_type"), q.get("entity_id")
            if not self.in_scope(persona, (t, eid)) and "roster_unscoped" not in self.defects:
                return nf
            hh = self.opp_household.get(eid) if t == "opportunity" else self.member_household.get(eid)
            return 200, {"data": {"children": [{"customer_member_id": m} for m, h in self.member_household.items() if h == hh and m in self.members],
                                  "recipients": [{"person_id": r} for r in self.household_people(hh)]}}
        if p == "/api/admin/pos/packets/compose":
            if persona not in self.AUTHORS:
                return 403, {"error": "Forbidden"}
            a = data.get("anchor") or {}
            anchor = (a["entity_type"], a["entity_id"]) if a else None
            if not anchor:
                return 400, {"error": "anchor required"}
            roster_opp = a["entity_id"] if a.get("entity_type") == "opportunity" else None
            kids, people = data.get("child_ids") or [], data.get("recipient_ids") or []
            if "compose_only_first_child" in self.defects:
                kids = kids[:1]
            if not self.destination_ok(persona, [anchor], kids, people, roster_opp, defect="compose_destination_unchecked"):
                return nf
            pid = self.new_id("pkt")
            self.packets.add(pid)
            self.composed.append(pid)
            return 201, {"data": {"packet_definition_id": pid, "shares": []}}
        if p == "/api/admin/forms/preview-payload":
            fks = data.get("launch_fks") or {}
            subject = ("opportunity", fks["opportunity_id"]) if fks.get("opportunity_id") else (("customer_member", fks["customer_member_id"]) if fks.get("customer_member_id") else None)
            if not self.in_scope(persona, subject) and "preview_unscoped" not in self.defects:
                return nf
            return 200, {"payload": {}, "mode": "prefill"}
        if p == "/api/admin/forms/submissions" and method == "POST":
            subj = {k: data.get(k) for k in ("opportunity_id", "customer_member_id")}
            if not self.in_scope(persona, self.sub_subject(subj)):
                return nf
            sid = self.new_id("sub")
            self.subs[sid] = {"id": sid, "status": "draft", **subj}
            return 201, {"data": {"id": sid}}
        m = re.fullmatch(r"/api/admin/forms/submissions/([^/]+)(?:/(submit|generate-document|manual-link|confirm-linkage))?", p)
        if m:
            s = self.subs.get(m.group(1))
            if not s:
                return nf
            verb = m.group(2)
            if not self.in_scope(persona, self.sub_subject(s)):
                if verb and "write_scope_capability_403" in self.defects:
                    return 403, {"error": "Forbidden"}
                if verb != "manual-link" or "manual_link_unscoped_current" not in self.defects:
                    return nf
            if verb is None:
                return 200, {"data": {k: v for k, v in s.items()}}
            if verb == "submit":
                if s["status"] != "draft":
                    return 409, {"error": "Only draft submissions can be submitted"}
                s["status"] = "submitted"
                return 200, {"data": {"id": s["id"]}}
            if verb == "generate-document":
                s["generated_document_id"] = "doc-x"
                return 200, {"document_id": "doc-x", "reused": False}
            if s["status"] != "submitted":
                return 409, {"error": "Only submitted submissions"}
            if verb == "manual-link":
                target = ("opportunity", data["opportunity_id"]) if data.get("opportunity_id") else None
                if "manual_link_target_unscoped" not in self.defects and not self.in_scope(persona, target):
                    return nf
                s["opportunity_id"], s["customer_member_id"] = data.get("opportunity_id"), None
                return 200, {"data": {"id": s["id"]}}
            return 200, {"data": {"id": s["id"]}}
        m = re.fullmatch(r"/api/admin/opportunities/([^/]+)/(delete-preview|delete)", p)
        if m:
            opp = m.group(1)
            if opp not in self.opps:
                return nf
            graph = self.lead_graph(opp)
            if m.group(2) == "delete-preview":
                return 200, {"preview": {"blocked": False, "will_delete": {"form_submissions": len(graph["subs"]), "customer_members": len(graph["members"]),
                                                                         "customers": 1 if graph["household"] else 0},
                                         "will_retain": {"customers": 0 if graph["household"] else 1,
                                                         "customer_members": len(graph["scoped_members"]) - len(graph["members"])}}}
            self.opps.discard(opp)
            self.ocm = {(o, mm) for (o, mm) in self.ocm if o != opp}
            for mm in graph["members"]:
                self.members.discard(mm)
            if graph["household"]:
                self.households.discard(graph["household"])
            for sid in graph["subs"]:
                self.subs.pop(sid, None)
            return 200, {"ok": True, "result": {"deleted": {}}}
        if p == "/api/admin/documents/library" and q.get("subject_type") == "child":
            return (200, {"library": {}}) if q.get("subject_id") in self.members else nf
        return 500, {"error": f"unmodelled {method} {p}"}

    def lead_graph(self, opp):
        hh = self.opp_household.get(opp)
        scoped = {m for m, h in self.member_household.items() if h == hh and m in self.members} | {m for (o, m) in self.ocm if o == opp}
        deletable = {m for m in scoped if not any(o != opp and mm == m for (o, mm) in self.ocm)}
        if "deletion_ignores_other_lead" in self.defects:
            deletable = set(scoped)
        other_opp_on_hh = any(o != opp and h == hh and o in self.opps for o, h in self.opp_household.items())
        household = None if other_opp_on_hh else hh
        subs = [sid for sid, s in self.subs.items() if s.get("opportunity_id") == opp or s.get("customer_member_id") in deletable]
        return {"members": deletable, "scoped_members": scoped, "household": household, "subs": subs}


class Harness:
    def __init__(self, defects=(), missing_personas=()):
        self.d = load_driver()
        self.p = FakeProduct(self.d.SC, defects)
        self.d.call = self.p.call
        self.d.results.clear()
        self.saved = []
        self.d.save_r2r5 = lambda ext: self.saved.append(copy.deepcopy(ext))
        self.sessions = {"fixture_admin", "scoped_forms", "cross_org_admin", "scoped_author"} - set(missing_personas)
        self.d.has_session = lambda persona: persona in self.sessions
        p = self.p
        p.subs.update({"s_opp1": {"id": "s_opp1", "status": "draft", "opportunity_id": L1, "customer_member_id": None},
                       "s_opp2": {"id": "s_opp2", "status": "draft", "opportunity_id": L2, "customer_member_id": None},
                       "s_ku": {"id": "s_ku", "status": "draft", "opportunity_id": None, "customer_member_id": KU}})
        self.ids = {"L1": {"opp": L1, "hh": HH1}, "L2": {"opp": L2, "hh": HH2}, "K1": K1, "KU": KU,
                    "form": {"id": FORM, "version_id": VERSION}, "subs": {k: k for k in ("s_opp1", "s_opp2", "s_ku")}}
        self.ext = {}

    def run(self):
        assert self.d.ensure_r2r5(self.ids, self.ext, save_fn=lambda e: None)
        self.d.certify_r2r5(self.ids, self.ext)
        return {(r["section"], r["case"]): r["pass"] for r in self.d.results}

    def failing(self):
        return sorted(case for (section, case), ok in self.run().items() if not ok)


class ConformingProduct(unittest.TestCase):
    def test_every_case_passes_and_every_section_is_present(self):
        h = Harness()
        res = h.run()
        self.assertEqual([c for c, ok in res.items() if not ok], [])
        self.assertEqual({s for s, _ in res}, {"R2-packet", "R2-writes", "R2-links", "R2-authoring", "R5-shared"})
        self.assertGreaterEqual(len(res), 60)

    def test_positive_and_denial_rows_both_exist_per_section(self):
        h = Harness()
        h.run()
        for section in ("R2-packet", "R2-writes", "R2-links", "R2-authoring"):
            cases = [r["case"] for r in h.d.results if r["section"] == section]
            self.assertTrue(any("404" in c for c in cases), section)
            self.assertTrue(any(("served" in c or "admitted" in c or "→ 200" in c or "→ 201" in c or "keeps" in c) for c in cases), section)

    def test_public_tokens_are_never_persisted(self):
        h = Harness()
        h.run()
        blob = json.dumps(h.ext) + json.dumps(h.saved) + json.dumps(h.d.results)
        self.assertTrue(h.p.seen_tokens)
        for tok in h.p.seen_tokens:
            self.assertNotIn(tok, blob)


class DefectsAreCaught(unittest.TestCase):
    def assertCaught(self, defect, needle):
        bad = Harness([defect]).failing()
        self.assertTrue(any(needle in c for c in bad), f"{defect}: no failing case mentions {needle!r}; failing={bad}")

    def test_session_list_leaking_out_of_scope_sessions(self):
        self.assertCaught("session_list_unfiltered", "list shows the in-scope (L1) session")

    def test_capability_shaped_refusal_is_not_a_scope_proof(self):
        self.assertCaught("session_read_capability_403", "session → 404")
        self.assertCaught("write_scope_capability_403", "(out of scope) → 404")

    def test_session_body_leak(self):
        self.assertCaught("session_read_leaks", "session of the QA D2 opportunity session → 404")

    def test_out_of_scope_write_that_succeeds(self):
        bad = Harness(["manual_link_unscoped_current"]).failing()
        self.assertIn("manual-link on s_opp2 (out of scope) → 404, names nothing", bad)

    def test_link_list_and_preview_scope(self):
        self.assertCaught("link_list_unfiltered", "drops L2's")
        self.assertCaught("preview_unscoped", "preview-payload prefilled from QA D2 L2 → 404")

    def test_lead_deletion_taking_the_shared_child(self):
        bad = Harness(["deletion_ignores_other_lead"]).failing()
        self.assertTrue(any("SHARED's child-only submission survives" in c for c in bad), bad)
        self.assertTrue(any("delete-preview of lead A" in c for c in bad), bad)

    def test_manual_link_target_gap_fails_its_case_and_cannot_be_skipped(self):
        bad = Harness(["manual_link_target_unscoped"]).failing()
        self.assertEqual(bad, ["manual-link of an in-scope submission ONTO the QA D2 opportunity → 404 (a write's target is scoped too)"])
        d = load_driver()
        self.assertNotIn("skip", d.certify_r2r5.__code__.co_varnames)

    def test_packet_link_destination(self):
        bad = Harness(["packet_destination_unchecked"]).failing()
        for needle in ("metadata naming L2 as prefill source", "enrollment selection of the out-of-scope child KU", "metadata children [K1, KU]"):
            self.assertTrue(any(needle in c for c in bad), (needle, bad))

    def test_authoring_destinations(self):
        self.assertCaught("compose_destination_unchecked", "compose on L1 naming KU → 404")
        self.assertCaught("compose_destination_unchecked", "compose on L1 naming an L2 household recipient → 404")
        self.assertCaught("compose_only_first_child", "compose on L1 naming [K1, KU] → 404")
        self.assertCaught("roster_unscoped", "roster of the QA D2 lead → 404")
        self.assertCaught("link_metadata_unscoped", "link mint whose metadata names L2 as existing-record prefill source → 404")
        self.assertCaught("link_metadata_unscoped", "refusals wrote no link (admin list unchanged)")
        self.assertCaught("patch_existing_unscoped", "PATCH of the link naming L2 → 404")


class MissingPersonasAreUnproven(unittest.TestCase):
    def test_missing_scoped_author_fails_every_authoring_case_as_not_run(self):
        h = Harness(missing_personas=["scoped_author"])
        h.run()
        auth = [r for r in h.d.results if r["section"] == "R2-authoring" and r["persona"] == "scoped_author"]
        self.assertEqual(len(auth), 16)
        self.assertTrue(all(not r["pass"] and r["status"] == "not_run" for r in auth))
        others = [r for r in h.d.results if r["section"] != "R2-authoring"]
        self.assertTrue(all(r["pass"] for r in others))

    def test_missing_scoped_forms_fails_every_section(self):
        h = Harness(missing_personas=["scoped_forms"])
        h.run()
        sections = {r["section"] for r in h.d.results if not r["pass"]}
        self.assertTrue({"R2-packet", "R2-writes", "R2-links", "R5-shared"} <= sections, sections)
        self.assertFalse(any(r["pass"] for r in h.d.results if r["section"] != "R2-authoring"))


class EnsureAndReset(unittest.TestCase):
    def test_ensure_refuses_without_the_registered_shared_child_fixture(self):
        h = Harness()
        h.p.opps.discard(h.d.SC["lead_a"])
        self.assertFalse(h.d.ensure_r2r5(h.ids, h.ext, save_fn=lambda e: None))
        self.assertEqual(h.ext, {})

    def test_reset_after_a_partial_certify_removes_both_leads(self):
        h = Harness()
        assert h.d.ensure_r2r5(h.ids, h.ext, save_fn=lambda e: None)
        out = h.d.reset_r2r5(h.ext)  # certify never ran: neither lead deleted yet
        self.assertTrue(out["product_teardown_gone"], out)
        self.assertNotIn(h.d.SC["lead_a"], h.p.opps)
        self.assertNotIn(h.d.SC["child_shared"], h.p.members)

    def test_reset_after_certify_is_clean_and_idempotent(self):
        h = Harness()
        h.run()
        self.assertTrue(h.d.reset_r2r5(h.ext)["product_teardown_gone"])
        self.assertTrue(h.d.reset_r2r5(h.ext)["product_teardown_gone"])


class FixtureBinding(unittest.TestCase):
    def test_driver_ids_are_the_ensure_fixture_ids(self):
        with open(os.path.join(ROOT, "certification/fixtures/qa-documents-shared-child-ensure.sql")) as f:
            sql = f.read()
        sets = dict(re.findall(r"^\\set (\w+) '([^']*)'$", sql, re.M))
        d = load_driver()
        for k, v in d.SC.items():
            self.assertEqual(sets[k], v, k)


if __name__ == "__main__":
    unittest.main()
