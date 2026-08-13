-- =============================================================================
-- Attendance V1 — certification fixtures
-- =============================================================================
-- Adds ONLY what the Attendance / Employment scenarios need, on top of the
-- representative seed AND `certification/search-platform/01-search-certification-fixtures.sql`
-- (which owns the Smith household, Jane Smith, Joe + Emma, their enrollment
-- agreements and the M/W/F schedule pattern this file reuses).
--
-- ── WHY THIS FILE EXISTS ──
--
-- Every artifact below was previously seeded BY HAND into the shared stack across
-- several sessions and never committed. That made the browser certification
-- unreproducible and silently dependent on ambient stack state: when the stack was
-- reaped and reset, the entire Attendance fixture vanished and no committed
-- artifact could rebuild it. The DB certifications in
-- `supabase/tests/employment/*.sql` also reference the search fixture's schedule
-- pattern without creating it, so that dependency is now explicit and satisfied
-- by an ordered pair of files rather than by luck.
--
-- ── WHAT THIS IS NOT ──
--
-- This is NOT a production seed and cannot become one. It runs only against the
-- disposable local certification tenant: it resolves the org by slug and fails
-- loudly if that org is absent, so it cannot be pointed at a shared or hosted
-- tenant by accident. No migration under `supabase/migrations/` inserts any of
-- this data — those files are pure DDL.
--
-- Idempotent: deterministic UUIDs in the fixture-owned range
-- (…-0000-4000-8000-00005xxxxxxx) with ON CONFLICT DO UPDATE, so re-running is
-- safe and re-running after a reset restores the exact certified scenario.
--
-- Usage:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f certification/search-platform/01-search-certification-fixtures.sql
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f certification/attendance/01-attendance-fixture.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Refuse anything that is not the synthetic certification tenant.
DO $$
DECLARE v_org uuid;
BEGIN
    SELECT id INTO v_org FROM public.orgs WHERE slug = 'northwind-early-learning';
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Attendance fixtures require the synthetic certification tenant (org slug northwind-early-learning). Refusing to run.';
    END IF;
END $$;

-- The search fixture is a hard prerequisite: it owns the household this scenario
-- is built on. Failing here is far cheaper than a browser run that reports an
-- empty room and reads as "the product is broken".
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = '00000000-0000-4000-8000-000050000010') THEN
        RAISE EXCEPTION 'Missing search-platform fixtures — run certification/search-platform/01-search-certification-fixtures.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.schedule_patterns WHERE id = '00000000-0000-4000-8000-000050000040') THEN
        RAISE EXCEPTION 'Missing schedule pattern …050000040 — run the search-platform fixtures first.';
    END IF;
END $$;

-- ── Org vocabulary ───────────────────────────────────────────────────────────
-- The tenant ships with NEITHER of these tables populated, and both are hard
-- gates: without an assignment type `assignment.create` refuses with "Choose an
-- Assignment Category", and without a position the Employment card has no
-- capacity to name.

INSERT INTO public.employment_positions (id, org_id, key, label, is_active, sort_order)
SELECT '00000000-0000-4000-8000-000050000060', o.id, 'lead_teacher', 'Lead Teacher', true, 10
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, is_active = true;

INSERT INTO public.operational_assignment_types
    (id, org_id, key, label, subject_types, staffing_participation, attendance_participation,
     billing_participation, visual_tone, sort_order, is_active)
SELECT '00000000-0000-4000-8000-000050000061', o.id, 'staff_classroom', 'Classroom Staff',
       ARRAY['staff']::text[], 'supply', 'none', 'none', 'info', 10, true
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET staffing_participation = 'supply', is_active = true;

INSERT INTO public.operational_assignment_types
    (id, org_id, key, label, subject_types, staffing_participation, attendance_participation,
     billing_participation, visual_tone, sort_order, is_active)
SELECT '00000000-0000-4000-8000-000050000062', o.id, 'primary_classroom', 'Primary Classroom',
       ARRAY['child']::text[], 'demand', 'expected', 'eligible', 'neutral', 20, true
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET staffing_participation = 'demand', attendance_participation = 'expected', is_active = true;

-- ── Ratio configuration ──────────────────────────────────────────────────────
-- Room-scoped rule on Toddler Room A. WITHOUT this, required staff resolves to
-- NULL and every sufficiency verdict reads `unknown` — which is honest but makes
-- the sufficient/short transition uncertifiable. `source_key` marks it as cert
-- data so it can never be mistaken for tenant configuration.

INSERT INTO public.childcare_ratio_rules
    (id, org_id, scope_type, room_location_id, effective_start, source_key, metadata)
SELECT '00000000-0000-4000-8000-000050000063', o.id, 'room',
       '00000000-0000-4000-8000-000000000013', DATE '2026-01-01', 'cert_fixture', '{}'::jsonb
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET effective_start = DATE '2026-01-01', source_key = 'cert_fixture';

-- One staff per four children: with one child present, one staff satisfies the
-- room; with zero staff present it is short. That is the transition S1 certifies.
INSERT INTO public.childcare_ratio_rule_tiers
    (id, org_id, ratio_rule_id, max_children, required_staff, sort_order)
SELECT '00000000-0000-4000-8000-000050000064', o.id,
       '00000000-0000-4000-8000-000050000063', 4, 1, 10
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET max_children = 4, required_staff = 1;

-- ── Child placements — the room's EXPECTED demand ────────────────────────────
-- Joe and Emma placed in Toddler Room A. The Attendance roster reads placements,
-- not agreements, so without these the room renders with no children at all.

INSERT INTO public.child_placements
    (id, org_id, enrollment_agreement_id, customer_member_id, site_location_id,
     room_location_id, start_date, status, source_key)
SELECT '00000000-0000-4000-8000-000050000065', o.id,
       '00000000-0000-4000-8000-000050000050', '00000000-0000-4000-8000-000050000020',
       '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013',
       DATE '2026-01-05', 'active', 'cert_fixture'
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET status = 'active', room_location_id = '00000000-0000-4000-8000-000000000013';

INSERT INTO public.child_placements
    (id, org_id, enrollment_agreement_id, customer_member_id, site_location_id,
     room_location_id, start_date, status, source_key)
SELECT '00000000-0000-4000-8000-000050000066', o.id,
       '00000000-0000-4000-8000-000050000051', '00000000-0000-4000-8000-000050000021',
       '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013',
       DATE '2026-01-05', 'active', 'cert_fixture'
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET status = 'active', room_location_id = '00000000-0000-4000-8000-000000000013';

-- ── A weekday-independent staff pattern ──────────────────────────────────────
-- ⚠ The staff assignment below deliberately does NOT reuse the search fixture's
-- Mon/Wed/Fri pattern. Staff supply is projected per weekday, so on a Tuesday or
-- Thursday that pattern puts NOBODY in the room and the whole Attendance
-- certification fails with "the seeded staff member is not on today's roster" —
-- a fixture artefact that reads exactly like a product defect. It cost a full
-- promotion cert run to diagnose. This pattern covers Mon–Fri so the scenario is
-- reproducible on any weekday.
INSERT INTO public.schedule_patterns
    (id, org_id, site_location_id, key, label, schedule_type_key, weekdays, is_active, sort_order)
SELECT '00000000-0000-4000-8000-000050000069', o.id,
       '00000000-0000-4000-8000-000000000010', 'cert_all_week', 'Cert — Mon to Fri',
       'full_time', ARRAY[1,2,3,4,5], true, 90
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET weekdays = ARRAY[1,2,3,4,5], is_active = true;

-- ── The Attendance certification's OWN child ─────────────────────────────────
-- ⚠ Deliberately NOT Joe or Emma. Those two belong to the Search fixture's
-- sibling-schedule-grain scenario (Joe M/W/F, Emma Tue/Thu) and that scenario is
-- the point of them — repurposing either would either break Search's assertions
-- or make Attendance certification pass only on certain weekdays. It did exactly
-- that: the run after the date rolled to a Thursday reported "the seeded child is
-- not on today's roster", which reads as a product defect and is not one.
--
-- Ada is placed in the same room on the Mon–Fri cert pattern, so the room is
-- populated on any weekday, and she belongs to the Smith household so a child
-- gesture still resolves through a household that owns a real case.
INSERT INTO public.persons (id, org_id, first_name, last_name, full_name)
SELECT '00000000-0000-4000-8000-00005000006a', o.id, 'Ada', 'Smith', 'Ada Smith'
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET full_name = 'Ada Smith';

INSERT INTO public.customer_members
    (id, org_id, customer_id, person_id, display_name, first_name, last_name, relationship, dob)
SELECT '00000000-0000-4000-8000-00005000006b', o.id, '00000000-0000-4000-8000-000050000001',
       '00000000-0000-4000-8000-00005000006a', 'Ada Smith', 'Ada', 'Smith', 'child', DATE '2021-06-01'
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET display_name = 'Ada Smith', person_id = '00000000-0000-4000-8000-00005000006a';

INSERT INTO public.child_enrollment_agreements
    (id, org_id, customer_member_id, customer_id, person_id, site_location_id, status, start_date, source_key)
SELECT '00000000-0000-4000-8000-00005000006c', o.id, '00000000-0000-4000-8000-00005000006b',
       '00000000-0000-4000-8000-000050000001', '00000000-0000-4000-8000-00005000006a',
       '00000000-0000-4000-8000-000000000010', 'active', DATE '2026-01-05', 'cert_fixture'
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET status = 'active';

INSERT INTO public.child_placements
    (id, org_id, enrollment_agreement_id, customer_member_id, site_location_id,
     room_location_id, start_date, status, source_key)
SELECT '00000000-0000-4000-8000-00005000006d', o.id,
       '00000000-0000-4000-8000-00005000006c', '00000000-0000-4000-8000-00005000006b',
       '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013',
       DATE '2026-01-05', 'active', 'cert_fixture'
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET status = 'active';

-- The EXPECTATION itself: a child-subject assignment on the all-week pattern.
-- Placements supply the room; the weekday comes from the assignment's pattern,
-- which is why a placement alone leaves the room empty on the wrong day.
INSERT INTO public.schedule_assignments
    (id, org_id, subject_type, customer_member_id, enrollment_agreement_id, site_location_id,
     room_location_id, schedule_pattern_id, start_date, status, assignment_kind, source_key,
     operational_assignment_type_id, is_primary, commitment_kind)
SELECT '00000000-0000-4000-8000-00005000006e', o.id, 'child',
       '00000000-0000-4000-8000-00005000006b', '00000000-0000-4000-8000-00005000006c',
       '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013',
       '00000000-0000-4000-8000-000050000069', DATE '2026-01-05', 'active', 'base', 'cert_fixture',
       '00000000-0000-4000-8000-000050000062', true, 'committed'
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET
    status = 'active',
    schedule_pattern_id = '00000000-0000-4000-8000-000050000069',
    room_location_id = '00000000-0000-4000-8000-000000000013';

-- ── Employment + staff supply ────────────────────────────────────────────────
-- Jane Smith is the Smith household's PRIMARY CONTACT and also employed here.
--
-- ⚠ That dual role is the whole point, not a convenience. A Person attention
-- gesture resolves through the household to its case, so only a person whose
-- household owns a case the Work View actually pages in can demonstrate the
-- Employment card on a real operator path. The tenant's other candidates resolve
-- to lead-fixture inquiries the New Leads view does not page in, where the
-- platform correctly answers "That record isn't in this Work View" instead.

INSERT INTO public.employments
    (id, org_id, person_id, employment_status, employment_type, position_id,
     primary_location_id, external_employee_id, start_date, source_key)
SELECT '00000000-0000-4000-8000-000050000067', o.id,
       '00000000-0000-4000-8000-000050000010', 'active', 'part_time',
       '00000000-0000-4000-8000-000050000060', '00000000-0000-4000-8000-000000000010',
       'EMP-0042', DATE '2026-08-01', 'cert_fixture'
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET employment_status = 'active', start_date = DATE '2026-08-01';

-- Staff supply: Jane in Toddler Room A on the search fixture's M/W/F pattern.
-- Staff supply is filtered by employment coverage per day, so the employment
-- above is a prerequisite for this row to project at all.
INSERT INTO public.schedule_assignments
    (id, org_id, subject_type, subject_person_id, site_location_id, room_location_id,
     schedule_pattern_id, start_date, status, assignment_kind, source_key,
     operational_assignment_type_id, is_primary, commitment_kind)
SELECT '00000000-0000-4000-8000-000050000068', o.id, 'staff',
       '00000000-0000-4000-8000-000050000010', '00000000-0000-4000-8000-000000000010',
       '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000050000069',
       DATE '2026-08-01', 'planned', 'base', 'cert_fixture',
       '00000000-0000-4000-8000-000050000061', false, 'committed'
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET
    status = 'planned',
    room_location_id = '00000000-0000-4000-8000-000000000013',
    -- Re-point an assignment left over from an earlier fixture revision, or a stack that still
    -- holds the M/W/F pattern would keep failing on Tue/Thu with a row that looks correct.
    schedule_pattern_id = '00000000-0000-4000-8000-000050000069';

-- ── Verify, loudly ───────────────────────────────────────────────────────────
DO $$
DECLARE v_positions int; v_types int; v_tiers int; v_placements int; v_emp int; v_supply int;
BEGIN
    SELECT count(*) INTO v_positions FROM public.employment_positions WHERE is_active;
    SELECT count(*) INTO v_types FROM public.operational_assignment_types WHERE is_active;
    SELECT count(*) INTO v_tiers FROM public.childcare_ratio_rule_tiers
        WHERE ratio_rule_id = '00000000-0000-4000-8000-000050000063';
    SELECT count(*) INTO v_placements FROM public.child_placements
        WHERE room_location_id = '00000000-0000-4000-8000-000000000013' AND status = 'active';
    SELECT count(*) INTO v_emp FROM public.employments
        WHERE person_id = '00000000-0000-4000-8000-000050000010' AND employment_status = 'active';
    SELECT count(*) INTO v_supply FROM public.schedule_assignments
        WHERE subject_type = 'staff' AND subject_person_id = '00000000-0000-4000-8000-000050000010';

    IF NOT EXISTS (
        SELECT 1 FROM public.schedule_patterns p
        JOIN public.schedule_assignments a ON a.schedule_pattern_id = p.id
        WHERE a.id = '00000000-0000-4000-8000-000050000068'
          AND EXTRACT(ISODOW FROM CURRENT_DATE)::int = ANY (p.weekdays)
    ) AND EXTRACT(ISODOW FROM CURRENT_DATE)::int <= 5 THEN
        RAISE EXCEPTION 'Staff pattern does not cover today (%) — the Attendance scenario would render an empty staff list',
            to_char(CURRENT_DATE, 'Day');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.schedule_assignments a
        JOIN public.schedule_patterns p ON p.id = a.schedule_pattern_id
        WHERE a.id = '00000000-0000-4000-8000-00005000006e'
          AND EXTRACT(ISODOW FROM CURRENT_DATE)::int = ANY (p.weekdays)
    ) AND EXTRACT(ISODOW FROM CURRENT_DATE)::int <= 5 THEN
        RAISE EXCEPTION 'Cert child is not expected today (%) — the room would render empty',
            to_char(CURRENT_DATE, 'Day');
    END IF;

    IF v_positions < 1 OR v_types < 2 OR v_tiers < 1 OR v_placements < 2 OR v_emp < 1 OR v_supply < 1 THEN
        RAISE EXCEPTION 'Attendance fixture incomplete: positions=% types=% tiers=% placements=% employment=% supply=%',
            v_positions, v_types, v_tiers, v_placements, v_emp, v_supply;
    END IF;

    RAISE NOTICE 'Attendance certification fixtures verified: % placements in Toddler Room A, % employed staff, ratio 1:4 configured',
        v_placements, v_emp;
END $$;

COMMIT;
