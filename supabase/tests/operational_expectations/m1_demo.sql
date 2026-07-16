-- =============================================================================
-- Operational Expectations — M1 (Ledger Foundation) live demonstration
-- =============================================================================
-- The frozen M1 Demo, executed against real Postgres (Engineering Realization §4):
--
--   "Author a `required` staffing-ratio expectation on a real room; attempt a
--    malformed and a sixth-modality act (both rejected); revise it (re-plans) and
--    correct it (unwinds) — lineage visible. G-Modality-Closure, G-Standing
--    (authoring) green."
--
-- This script owns the DATABASE half: the authoring acts, the rejections, the
-- appended typed transitions, the lineage, and append-only preservation — all
-- through the real DDL / triggers / SECURITY DEFINER RPCs.
--
-- The RESOLVER half (revision re-plans forward / correction unwinds, two-axis
-- as-of) is a pure fold over these rows and is certified in
-- `web/tests/operationalExpectations/resolver/m1DemoLineage.test.ts`, which runs
-- against the REAL rows this script emits (captured as a fixture). Splitting the
-- halves keeps the DB demo IO-real and the resolver demo pure — the resolver has
-- no database dependency by design (Wave D).
--
-- Adds NO migration and NO runtime capability. Read-only with respect to the
-- shipped substrate: it exercises what Waves A–D already shipped.
--
-- Run: see README.md ("M1 demonstration").
-- =============================================================================

\set ON_ERROR_STOP on
SET client_min_messages TO notice;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, msg text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN IF NOT cond THEN RAISE EXCEPTION 'M1 FAIL: %', msg; ELSE RAISE NOTICE 'PASS %', msg; END IF; END $$;

CREATE OR REPLACE FUNCTION pg_temp.raises(sql text, want text, msg text) RETURNS void LANGUAGE plpgsql AS
$$ DECLARE got text := NULL;
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN got := SQLSTATE || '|' || SQLERRM; END;
  IF got IS NULL THEN RAISE EXCEPTION 'M1 FAIL (no error): %', msg;
  ELSIF want IS NOT NULL AND position(want in got) = 0 THEN RAISE EXCEPTION 'M1 FAIL (got [%] want [%]): %', got, want, msg;
  ELSE RAISE NOTICE 'PASS %', msg; END IF;
END $$;

-- Demo state carried across transactions.
--
-- Each authoring act runs in its OWN transaction, exactly as production does (one
-- RPC call = one transaction). This is load-bearing, not cosmetic: `authored_at`
-- defaults to `now()`, which in Postgres is TRANSACTION-START time, so authoring
-- the whole lineage inside one DO block would stamp every act with an identical
-- transaction time and make the resolver's as-known-at-T (audit) axis
-- undemonstrable. Separate transactions reproduce real recorded-time ordering.
CREATE TABLE IF NOT EXISTS pg_temp.m1_lineage (root uuid, org uuid, u_lead uuid, asg uuid,
                                               exp_create uuid, exp_revise uuid, exp_correct uuid);

DO $DEMO$
DECLARE
  org uuid;
  u_lead uuid := gen_random_uuid();
  a_ratio uuid; asg uuid;
  r jsonb;
  exp_create uuid; root uuid;
BEGIN
  INSERT INTO public.orgs DEFAULT VALUES RETURNING id INTO org;

  -- ---------------------------------------------------------------------------
  -- Setup: a governed authority, actually held by the room lead (X0 — authority
  -- is HELD, never merely claimed; an ungoverned claim can never bind).
  -- ---------------------------------------------------------------------------
  a_ratio := public.upsert_operational_authority(
      org, 'licensing:staffing-ratio', 'Licensing staffing ratio', null, 'licensing', true, u_lead);
  PERFORM pg_temp.ok(a_ratio IS NOT NULL, 'M1.0 authority governed in catalog');

  asg := public.grant_operational_authority_assignment(
      org, 'licensing:staffing-ratio', 'human', u_lead::text, 'organization', null,
      now() - interval '1 hour', null, u_lead);
  PERFORM pg_temp.ok(asg IS NOT NULL, 'M1.0 authority assigned to a human holder');

  -- ===========================================================================
  -- M1.1 — Author a `required` staffing-ratio expectation on a real room.
  -- ===========================================================================
  r := public.author_operational_expectation(org, u_lead, jsonb_build_object(
      'idempotency_key', 'm1-create',
      'payload_fingerprint', 'fp-create',
      'authority_key', 'licensing:staffing-ratio',
      'author_class', 'human',
      'modality', 'required',
      'subject_kind', 'room',
      'subject_ref', '["room-infant-1"]'::jsonb,
      'condition', '{"type":"staffing_ratio","max_children_per_staff":4}'::jsonb,
      'temporal_frame', '{"kind":"window","from":"2026-08-01T00:00:00Z"}'::jsonb,
      'verb', 'create',
      'footprint', '{"factTypes":["child_attendance_event","staff_shift_event"],"subjectKind":"room"}'::jsonb,
      'valid_from', '2026-08-01T00:00:00Z',
      'authority_holder_id', u_lead::text,
      'authority_scope_type', 'organization'));

  exp_create := (r->>'expectation_id')::uuid;
  root := (r->>'lineage_root_id')::uuid;

  PERFORM pg_temp.ok((r->>'ok')::boolean, 'M1.1 required staffing-ratio expectation authored on room-infant-1');
  PERFORM pg_temp.ok(r->>'modality' = 'required', 'M1.1 modality is required (deontic)');
  PERFORM pg_temp.ok(r->>'verb' = 'create' AND r->>'transition_type' IS NULL, 'M1.1 create roots a lineage (no transition)');
  PERFORM pg_temp.ok(root = exp_create, 'M1.1 a create roots itself');
  -- G-Standing (authoring): the holder self-ratifies WITHIN authority → binding.
  PERFORM pg_temp.ok(r->>'standing' = 'binding' AND (r->>'self_ratified')::boolean,
      'M1.1 G-Standing: held authority self-ratifies to binding');
  PERFORM pg_temp.ok((SELECT authority_assignment_id FROM public.operational_expectations WHERE id = exp_create) = asg,
      'M1.1 G-Standing: the authority assignment is recorded as evidence on the row');
  PERFORM pg_temp.ok(
      (SELECT count(*) FROM public.mutation_events WHERE subject_id = exp_create AND command_key = 'author_expectation') = 1,
      'M1.1 exactly one Authoring Act published');

  -- ===========================================================================
  -- M1.2 — A malformed act is REJECTED (before any commit).
  -- ===========================================================================
  -- Temporal Frame presence is a frozen P1 requirement: an empty frame is malformed.
  PERFORM pg_temp.raises(format(
      'SELECT public.author_operational_expectation(%L,%L,%L::jsonb)', org, u_lead,
      jsonb_build_object('idempotency_key','m1-malformed-frame','payload_fingerprint','fp-mf',
          'authority_key','licensing:staffing-ratio','author_class','human','modality','required',
          'subject_kind','room','subject_ref','["room-infant-1"]'::jsonb,
          'condition','{"type":"staffing_ratio","max_children_per_staff":4}'::jsonb,
          'temporal_frame','{}'::jsonb, 'verb','create',
          'footprint','{"factTypes":["child_attendance_event"]}'::jsonb,
          'valid_from','2026-08-01T00:00:00Z','authority_holder_id',u_lead::text,
          'authority_scope_type','organization')::text),
      '23514', 'M1.2 malformed act rejected (Temporal Frame absent)');

  -- An inverted valid window is malformed.
  PERFORM pg_temp.raises(format(
      'SELECT public.author_operational_expectation(%L,%L,%L::jsonb)', org, u_lead,
      jsonb_build_object('idempotency_key','m1-malformed-window','payload_fingerprint','fp-mw',
          'authority_key','licensing:staffing-ratio','author_class','human','modality','required',
          'subject_kind','room','subject_ref','["room-infant-1"]'::jsonb,
          'condition','{"type":"staffing_ratio","max_children_per_staff":4}'::jsonb,
          'temporal_frame','{"kind":"window"}'::jsonb, 'verb','create',
          'footprint','{"factTypes":["child_attendance_event"]}'::jsonb,
          'valid_from','2026-09-01T00:00:00Z','valid_to','2026-08-01T00:00:00Z',
          'authority_holder_id',u_lead::text,'authority_scope_type','organization')::text),
      '23514', 'M1.2 malformed act rejected (inverted valid window)');

  PERFORM pg_temp.ok((SELECT count(*) FROM public.operational_expectations WHERE org_id = org) = 1,
      'M1.2 no malformed row was committed');

  -- ===========================================================================
  -- M1.3 — A SIXTH modality is REJECTED (G-Modality-Closure).
  -- ===========================================================================
  PERFORM pg_temp.raises(format(
      'SELECT public.author_operational_expectation(%L,%L,%L::jsonb)', org, u_lead,
      jsonb_build_object('idempotency_key','m1-sixth','payload_fingerprint','fp-6',
          'authority_key','licensing:staffing-ratio','author_class','human',
          'modality','mandatory',   -- a sixth modality is an architecture escalation, not a value
          'subject_kind','room','subject_ref','["room-infant-1"]'::jsonb,
          'condition','{"type":"staffing_ratio","max_children_per_staff":4}'::jsonb,
          'temporal_frame','{"kind":"window"}'::jsonb, 'verb','create',
          'footprint','{"factTypes":["child_attendance_event"]}'::jsonb,
          'valid_from','2026-08-01T00:00:00Z','authority_holder_id',u_lead::text,
          'authority_scope_type','organization')::text),
      '23514', 'M1.3 G-Modality-Closure: a sixth modality is rejected');

  PERFORM pg_temp.ok((SELECT count(*) FROM public.operational_expectations WHERE org_id = org) = 1,
      'M1.3 no sixth-modality row was committed');

  INSERT INTO pg_temp.m1_lineage (root, org, u_lead, asg, exp_create)
  VALUES (root, org, u_lead, asg, exp_create);
END
$DEMO$;

-- Distinct transaction → distinct server-assigned recorded time.
SELECT pg_sleep(0.05);

DO $DEMO$
DECLARE
  org uuid; u_lead uuid; root uuid; exp_create uuid; exp_revise uuid;
  r jsonb;
  authored_before timestamptz; frame_before jsonb; validto_before timestamptz;
BEGIN
  SELECT m.org, m.u_lead, m.root, m.exp_create INTO org, u_lead, root, exp_create FROM pg_temp.m1_lineage m;

  -- ===========================================================================
  -- M1.4 — REVISE it (re-plans forward).
  -- ===========================================================================
  -- Capture the predecessor's stored state to prove append-only afterwards.
  SELECT authored_at, temporal_frame, valid_to INTO authored_before, frame_before, validto_before
    FROM public.operational_expectations WHERE id = exp_create;

  r := public.author_operational_expectation(org, u_lead, jsonb_build_object(
      'idempotency_key', 'm1-revise',
      'payload_fingerprint', 'fp-revise',
      'authority_key', 'licensing:staffing-ratio',
      'author_class', 'human',
      'modality', 'required',
      'subject_kind', 'room',
      'subject_ref', '["room-infant-1"]'::jsonb,
      -- Re-plan: from September the room runs a tighter ratio.
      'condition', '{"type":"staffing_ratio","max_children_per_staff":3}'::jsonb,
      'temporal_frame', '{"kind":"window","from":"2026-09-01T00:00:00Z"}'::jsonb,
      'verb', 'revise',
      'transition_type', 'revision',
      'supersedes_expectation_id', exp_create::text,
      'footprint', '{"factTypes":["child_attendance_event","staff_shift_event"],"subjectKind":"room"}'::jsonb,
      'valid_from', '2026-09-01T00:00:00Z',
      'authority_holder_id', u_lead::text,
      'authority_scope_type', 'organization'));

  exp_revise := (r->>'expectation_id')::uuid;
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'M1.4 revision authored');
  PERFORM pg_temp.ok(r->>'transition_type' = 'revision', 'M1.4 the transition is typed `revision`');
  PERFORM pg_temp.ok((r->>'lineage_root_id')::uuid = root, 'M1.4 revision joins the same lineage');
  PERFORM pg_temp.ok((r->>'supersedes_expectation_id')::uuid = exp_create, 'M1.4 revision supersedes by reference');
  PERFORM pg_temp.ok(r->>'standing' = 'binding', 'M1.4 revision authority >= original (binding)');

  -- Append-only is absolute: the predecessor is untouched.
  PERFORM pg_temp.ok(
      (SELECT authored_at FROM public.operational_expectations WHERE id = exp_create) = authored_before
      AND (SELECT temporal_frame FROM public.operational_expectations WHERE id = exp_create) = frame_before
      AND (SELECT valid_to FROM public.operational_expectations WHERE id = exp_create) IS NOT DISTINCT FROM validto_before,
      'M1.4 append-only: the revised predecessor row is NOT mutated (valid_to/frame/authored_at intact)');

  -- The revision is recorded strictly AFTER the create (real transaction time).
  PERFORM pg_temp.ok(
      (SELECT authored_at FROM public.operational_expectations WHERE id = exp_revise)
      > (SELECT authored_at FROM public.operational_expectations WHERE id = exp_create),
      'M1.4 recorded time advances: the revision is known strictly after the create');

  -- No state to carry: the next transaction re-derives the revision from the
  -- ledger by its typed transition, which is itself the point (lineage is
  -- readable, not remembered).
END
$DEMO$;

SELECT pg_sleep(0.05);

DO $DEMO$
DECLARE
  org uuid; u_lead uuid; root uuid;
  exp_create uuid; exp_revise uuid; exp_correct uuid;
  r jsonb; n int;
BEGIN
  SELECT m.org, m.u_lead, m.root, m.exp_create INTO org, u_lead, root, exp_create FROM pg_temp.m1_lineage m;
  SELECT e.id INTO exp_revise FROM public.operational_expectations e
   WHERE e.lineage_root_id = root AND e.transition_type = 'revision';

  -- ===========================================================================
  -- M1.5 — CORRECT it (unwinds).
  -- ===========================================================================
  -- The September re-plan was recorded wrong: the ratio should have been 5, and
  -- the prior assertion was NEVER valid (correction, not revision).
  r := public.author_operational_expectation(org, u_lead, jsonb_build_object(
      'idempotency_key', 'm1-correct',
      'payload_fingerprint', 'fp-correct',
      'authority_key', 'licensing:staffing-ratio',
      'author_class', 'human',
      'modality', 'required',
      'subject_kind', 'room',
      'subject_ref', '["room-infant-1"]'::jsonb,
      'condition', '{"type":"staffing_ratio","max_children_per_staff":5}'::jsonb,
      'temporal_frame', '{"kind":"window","from":"2026-09-01T00:00:00Z"}'::jsonb,
      'verb', 'correct',
      'transition_type', 'correction',
      'supersedes_expectation_id', exp_revise::text,
      'footprint', '{"factTypes":["child_attendance_event","staff_shift_event"],"subjectKind":"room"}'::jsonb,
      'valid_from', '2026-09-01T00:00:00Z',
      'authority_holder_id', u_lead::text,
      'authority_scope_type', 'organization'));

  exp_correct := (r->>'expectation_id')::uuid;
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'M1.5 correction authored');
  PERFORM pg_temp.ok(r->>'transition_type' = 'correction', 'M1.5 the transition is typed `correction` (NOT revision)');
  PERFORM pg_temp.ok((r->>'lineage_root_id')::uuid = root, 'M1.5 correction joins the same lineage');
  PERFORM pg_temp.ok((r->>'supersedes_expectation_id')::uuid = exp_revise, 'M1.5 correction supersedes the revision by reference');
  PERFORM pg_temp.ok(
      (SELECT count(*) FROM public.operational_expectations WHERE lineage_root_id = root AND transition_type = 'revision') = 1
      AND (SELECT count(*) FROM public.operational_expectations WHERE lineage_root_id = root AND transition_type = 'correction') = 1,
      'M1.5 Revision != Correction: both are stored, distinctly typed');

  -- ===========================================================================
  -- M1.6 — Lineage is VISIBLE.
  -- ===========================================================================
  SELECT count(*) INTO n FROM public.operational_expectations WHERE lineage_root_id = root;
  PERFORM pg_temp.ok(n = 3, 'M1.6 lineage visible: 3 appended acts on one root (create → revision → correction)');
  PERFORM pg_temp.ok(
      (SELECT count(*) FROM public.operational_expectations WHERE lineage_root_id = root AND verb = 'create') = 1,
      'M1.6 lineage has exactly one create (the root)');
  PERFORM pg_temp.ok(
      (SELECT count(*) FROM public.mutation_events
         WHERE command_key = 'author_expectation'
           AND subject_id IN (exp_create, exp_revise, exp_correct)) = 3,
      'M1.6 every act in the lineage is attributable (3 Authoring Acts)');

  -- Nothing was ever mutated: the whole lineage is append-only.
  PERFORM pg_temp.raises(format(
      'UPDATE public.operational_expectations SET standing=%L WHERE id=%L', 'proposed', exp_create),
      '0A000', 'M1.6 append-only absolute: UPDATE on the ledger is blocked');
  PERFORM pg_temp.raises(format(
      'DELETE FROM public.operational_expectations WHERE id=%L', exp_create),
      '0A000', 'M1.6 append-only absolute: DELETE on the ledger is blocked');

  -- The correction is recorded strictly AFTER the revision — this is what makes
  -- the as-known-at-T axis meaningful: a reader positioned before this instant
  -- must still see the revision (audit), not the correction.
  PERFORM pg_temp.ok(
      (SELECT authored_at FROM public.operational_expectations WHERE id = exp_correct)
      > (SELECT authored_at FROM public.operational_expectations WHERE id = exp_revise),
      'M1.6 recorded time advances: the correction is known strictly after the revision');

  RAISE NOTICE '--- M1 demo lineage root: % ---', root;
END
$DEMO$;

-- Emit the REAL rows for the resolver half (fixture input). ------------------
\pset format unaligned
\pset tuples_only on
\echo '--- M1_DEMO_ROWS_JSON_BEGIN ---'
SELECT jsonb_pretty(jsonb_agg(to_jsonb(x) ORDER BY x.authored_at))
FROM (
  SELECT e.id::text, e.org_id::text, e.lineage_root_id::text, e.supersedes_expectation_id::text,
         e.verb, e.transition_type, e.modality, e.author_class, e.authority_key, e.standing,
         e.subject_kind, e.condition,
         to_char(e.valid_from AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS valid_from,
         e.valid_to,
         to_char(e.authored_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS authored_at
  FROM public.operational_expectations e
  WHERE e.lineage_root_id = (SELECT root FROM pg_temp.m1_lineage LIMIT 1)
) x;
\echo '--- M1_DEMO_ROWS_JSON_END ---'
