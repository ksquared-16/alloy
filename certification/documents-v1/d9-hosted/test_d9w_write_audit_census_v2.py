"""W-C1 census v2 (d9w-write-audit-census-v2.sql) against synthetic rows, each scenario in its own psql session on
session temp tables (the census's `public.` is rewritten to `pg_temp.`), so nothing is read from or written to real
tables. T9 of finish/W-C1-STORED-AUDIT-LINKAGE-DESIGN.md.

  D9W_CENSUS_DB=postgresql://postgres:postgres@127.0.0.1:54422/postgres python3 -m unittest test_d9w_write_audit_census_v2
Skips when no database URL or psql is available.
"""
import os, shutil, subprocess, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
CENSUS = os.path.join(HERE, "d9w-write-audit-census-v2.sql")
DB = os.environ.get("D9W_CENSUS_DB")
PSQL = shutil.which("psql") or ("/opt/homebrew/opt/libpq/bin/psql" if os.path.exists("/opt/homebrew/opt/libpq/bin/psql") else None)

QA = "4acc9386-c485-486f-aa1f-05d83499d142"
OTHER_ORG = "ad53fee2-2570-460f-9300-f0e106c473b6"
APP = "00000000-0000-4000-8000-0000000000a1"
DOC = "00000000-0000-4000-8000-000000000d01"
VER = "00000000-0000-4000-8000-000000000e01"
SUBJ = "00000000-0000-4000-8000-000000000f01"
T0 = "2026-11-12T10:00:00+00"
APPLICATION = '"actor_kind":"application","actor_application_id":"%s","actor_installation_id":"i-1"' % APP

SCHEMA = """
create temp table developer_applications (id uuid, slug text);
create temp table documents (id uuid, org_id uuid, created_at timestamptz, metadata jsonb);
create temp table workflow_events (id uuid, org_id uuid, event_type text, entity_id uuid, created_at timestamptz, payload jsonb);
create temp table document_version_review_events (id uuid default gen_random_uuid(), org_id uuid, document_id uuid, version_id uuid, kind text, created_at timestamptz, audit_event_id uuid);
create temp table document_subjects (org_id uuid, document_id uuid, subject_id uuid, is_primary boolean, created_at timestamptz, ended_at timestamptz, link_audit_event_id uuid, unlink_audit_event_id uuid);
create temp table processing_cases (org_id uuid, created_at timestamptz, metadata jsonb);
"""


def at(sec):
    return f"('{T0}'::timestamptz + interval '{sec} seconds')"


def ev(eid, etype, sec, payload, org=QA, doc=DOC):
    return f"insert into workflow_events values ('{eid}', '{org}', '{etype}', '{doc}', {at(sec)}, '{{{payload}}}'::jsonb);"


def review(audit, sec, kind="review"):
    a = f"'{audit}'" if audit else "null"
    return f"insert into document_version_review_events (org_id, document_id, version_id, kind, created_at, audit_event_id) values ('{QA}', '{DOC}', '{VER}', '{kind}', {at(sec)}, {a});"


def base():
    meta = '{"source":"api_v1_upload","received_via":{"application_id":"%s","installation_id":"i-1"}}' % APP
    return [
        f"insert into developer_applications values ('{APP}', 'd9-documents-write-cert');",
        f"insert into documents values ('{DOC}', '{QA}', {at(1)}, '{meta}'::jsonb);",
        ev("00000000-0000-4000-8000-0000000000c1", "document_version_reviewed", 9, f'"version_id":"{VER}",{APPLICATION}'),
        review("00000000-0000-4000-8000-0000000000c1", 10),
    ]


def run(rows):
    with open(CENSUS) as f:
        census = f.read()
    sql = SCHEMA + "\n".join(rows) + "\n" + census.replace("public.", "pg_temp.")
    p = subprocess.run([PSQL, DB, "-At", "-v", "ON_ERROR_STOP=1", "-F", "|"], input=sql, capture_output=True, text=True, timeout=60)
    if p.returncode != 0:
        raise AssertionError(p.stderr)
    out = {}
    for line in p.stdout.splitlines():
        parts = line.split("|", 2)
        if len(parts) == 3 and parts[1] in ("check", "data"):
            out[parts[0]] = parts[2].rsplit(" ~ ", 1)[-1] if parts[1] == "check" else parts[2]
    return out


@unittest.skipUnless(DB and PSQL, "set D9W_CENSUS_DB to a Postgres URL (psql required)")
class W_C1CensusV2(unittest.TestCase):
    CHECKS = ["d9w_c1v2_effects_present", "d9w_c1v2_review_audit_id", "d9w_c1v2_link_audit_id", "d9w_c1v2_escalation_audit_id"]

    def assertOnly(self, out, false_checks=()):
        for c in self.CHECKS:
            self.assertEqual(out.get(c), "false" if c in false_checks else "true", f"{c}: {out}")

    def test_id_linked_review_passes(self):
        self.assertOnly(run(base()))

    def test_a_null_id_fails_even_with_a_perfect_earlier_audit_row(self):
        rows = base() + [ev("00000000-0000-4000-8000-0000000000c2", "document_version_validity_set", 19, f'"version_id":"{VER}",{APPLICATION}'),
                         review(None, 20, "validity")]
        self.assertOnly(run(rows), {"d9w_c1v2_review_audit_id"})

    def test_a_stray_audit_from_a_refused_call_never_counts(self):
        # The refused call's audit exists (c9); the later effect stores ITS own id (c3). Both rows are fine; the stray is unbound.
        rows = base() + [ev("00000000-0000-4000-8000-0000000000c9", "document_version_validity_set", 15, f'"version_id":"{VER}",{APPLICATION}'),
                         ev("00000000-0000-4000-8000-0000000000c3", "document_version_validity_set", 19, f'"version_id":"{VER}",{APPLICATION}'),
                         review("00000000-0000-4000-8000-0000000000c3", 20, "validity")]
        self.assertOnly(run(rows))

    def test_wrong_org_type_version_or_actor_fails(self):
        cases = {
            "org": ev("00000000-0000-4000-8000-0000000000c4", "document_version_validity_set", 19, f'"version_id":"{VER}",{APPLICATION}', org=OTHER_ORG),
            "type": ev("00000000-0000-4000-8000-0000000000c4", "document_version_reviewed", 19, f'"version_id":"{VER}",{APPLICATION}'),
            "version": ev("00000000-0000-4000-8000-0000000000c4", "document_version_validity_set", 19, f'"version_id":"{SUBJ}",{APPLICATION}'),
            "actor": ev("00000000-0000-4000-8000-0000000000c4", "document_version_validity_set", 19, f'"version_id":"{VER}","actor_user_id":"u-1"'),
            "after": ev("00000000-0000-4000-8000-0000000000c4", "document_version_validity_set", 21, f'"version_id":"{VER}",{APPLICATION}'),
        }
        for name, row in cases.items():
            with self.subTest(name):
                self.assertOnly(run(base() + [row, review("00000000-0000-4000-8000-0000000000c4", 20, "validity")]), {"d9w_c1v2_review_audit_id"})

    def test_one_audit_bound_to_two_effects_fails(self):
        rows = base() + [review("00000000-0000-4000-8000-0000000000c1", 30)]
        self.assertOnly(run(rows), {"d9w_c1v2_review_audit_id"})

    def test_link_and_unlink_each_need_their_own_matching_id(self):
        ok = base() + [
            ev("00000000-0000-4000-8000-0000000000e1", "document_subject_changed", 59, f'"change":"link","subject_id":"{SUBJ}",{APPLICATION}'),
            ev("00000000-0000-4000-8000-0000000000e2", "document_subject_changed", 69, f'"change":"unlink","subject_id":"{SUBJ}",{APPLICATION}'),
            f"insert into document_subjects values ('{QA}', '{DOC}', '{SUBJ}', false, {at(60)}, {at(70)}, '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2');",
        ]
        self.assertOnly(run(ok))
        swapped = base() + [
            ev("00000000-0000-4000-8000-0000000000e1", "document_subject_changed", 59, f'"change":"link","subject_id":"{SUBJ}",{APPLICATION}'),
            ev("00000000-0000-4000-8000-0000000000e2", "document_subject_changed", 69, f'"change":"unlink","subject_id":"{SUBJ}",{APPLICATION}'),
            f"insert into document_subjects values ('{QA}', '{DOC}', '{SUBJ}', false, {at(60)}, {at(70)}, '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e1');",
        ]
        self.assertOnly(run(swapped), {"d9w_c1v2_link_audit_id"})

    def test_escalation_needs_its_system_audit_id(self):
        case = ("insert into processing_cases values ('%s', %s, '{\"api_upload_escalation\":{\"kind\":\"api_v1_unfiled_upload\","
                "\"document_id\":\"%s\"%s}}'::jsonb);")
        esc = ev("00000000-0000-4000-8000-0000000000f9", "document_unfiled_upload_escalated", 39, '"actor_kind":"system","actor_process":"api_upload_escalation"')
        self.assertOnly(run(base() + [esc, case % (QA, at(40), DOC, ',"audit_event_id":"00000000-0000-4000-8000-0000000000f9"')]))
        self.assertOnly(run(base() + [esc, case % (QA, at(40), DOC, "")]), {"d9w_c1v2_escalation_audit_id"})

    def test_no_review_effect_is_visible(self):
        rows = base()[:2]
        self.assertOnly(run(rows), {"d9w_c1v2_effects_present"})


if __name__ == "__main__":
    unittest.main()
