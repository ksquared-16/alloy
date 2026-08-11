-- Employment foundation — database certification (Staff Foundation Phase 1)
-- =============================================================================
-- Runs entirely inside one transaction and ROLLS BACK. Safe against the shared
-- local stack.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/employment/employment_foundation_cert.sql
--
-- Proves, at the database level:
--   C1  employment is org-scoped; a person from another org cannot be attached
--   C2  overlapping open employment for one person in one org is rejected
--   C3  a non-overlapping rehire period is allowed, and history survives
--   C4  ending employment preserves the prior row and its dates
--   C5  person_is_employed_on is effective-time (ended employment still covers
--       the days inside its own window)
--   C6  a staff schedule_assignment is REJECTED without employment
--   C7  the same assignment is ACCEPTED with employment covering start_date
--   C8  an assignment starting after employment ended is REJECTED
--   C9  a historical staff assignment survives employment ending
--   C10 persons.is_employee alone does NOT admit a staff subject (the whole
--       point of the repoint — negative control for Workstream F)
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE cert_ctx AS
SELECT
    '00000000-0000-4000-8000-000000000001'::uuid AS org_a,
    'cccccccc-0000-4000-8000-00000000c001'::uuid AS org_b,
    '00000000-0000-4000-8000-000000000010'::uuid AS site_a,
    '00000000-0000-4000-8000-000050000040'::uuid AS pattern_a;

CREATE TEMP TABLE cert_ids (k text PRIMARY KEY, v uuid);

WITH ins AS (
    INSERT INTO public.persons (org_id, first_name, last_name, full_name)
    SELECT org_a, 'Jane', 'Wilson-Cert', 'Jane Wilson-Cert' FROM cert_ctx
    RETURNING id
) INSERT INTO cert_ids SELECT 'person_a', id FROM ins;

WITH ins AS (
    INSERT INTO public.persons (org_id, first_name, last_name, full_name)
    SELECT org_b, 'Otherorg', 'Person-Cert', 'Otherorg Person-Cert' FROM cert_ctx
    RETURNING id
) INSERT INTO cert_ids SELECT 'person_b', id FROM ins;

WITH ins AS (
    INSERT INTO public.employment_positions (org_id, key, label)
    SELECT org_a, 'lead_teacher_cert', 'Lead Teacher' FROM cert_ctx
    RETURNING id
) INSERT INTO cert_ids SELECT 'position_a', id FROM ins;

CREATE OR REPLACE FUNCTION pg_temp.cert_id(p_k text) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT v FROM cert_ids WHERE k = p_k $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_fail(p_label text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'PASS  %  (rejected: %)', p_label, left(SQLERRM, 90);
        RETURN;
    END;
    RAISE EXCEPTION 'FAIL  % — statement was accepted but must be rejected', p_label;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF p_cond THEN RAISE NOTICE 'PASS  %', p_label;
    ELSE RAISE EXCEPTION 'FAIL  %', p_label;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- C1 — org scoping
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_fail(
    'C1 cross-org person cannot be employed',
    format(
        'INSERT INTO public.employments (org_id, person_id, start_date) VALUES (%L, %L, DATE ''2026-01-01'')',
        (SELECT org_a FROM cert_ctx), pg_temp.cert_id('person_b')
    )
);

SELECT pg_temp.expect_fail(
    'C1 cross-org position cannot be used',
    format(
        'INSERT INTO public.employments (org_id, person_id, position_id, start_date) VALUES (%L, %L, %L, DATE ''2026-01-01'')',
        (SELECT org_b FROM cert_ctx), pg_temp.cert_id('person_b'), pg_temp.cert_id('position_a')
    )
);

-- ---------------------------------------------------------------------------
-- First employment period: 2026-01-01 .. 2026-06-30
-- ---------------------------------------------------------------------------
WITH ins AS (
    INSERT INTO public.employments (org_id, person_id, position_id, primary_location_id,
                                    employment_type, employment_status, start_date)
    SELECT org_a, pg_temp.cert_id('person_a'), pg_temp.cert_id('position_a'), site_a,
           'full_time', 'active', DATE '2026-01-01'
    FROM cert_ctx
    RETURNING id
) INSERT INTO cert_ids SELECT 'emp1', id FROM ins;

-- ---------------------------------------------------------------------------
-- C2 — overlapping open employment is rejected
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_fail(
    'C2 overlapping open employment rejected',
    format(
        'INSERT INTO public.employments (org_id, person_id, start_date) VALUES (%L, %L, DATE ''2026-03-01'')',
        (SELECT org_a FROM cert_ctx), pg_temp.cert_id('person_a')
    )
);

-- ---------------------------------------------------------------------------
-- C6 / C10 — staff assignment eligibility BEFORE the covering window
-- ---------------------------------------------------------------------------
-- persons.is_employee is explicitly set TRUE here and must NOT be what admits
-- the subject. The assignment starts 2025-06-01, before employment began.
UPDATE public.persons SET is_employee = true WHERE id = pg_temp.cert_id('person_a');

SELECT pg_temp.expect_fail(
    'C6/C10 staff assignment rejected outside employment (is_employee=true is not authority)',
    format(
        'INSERT INTO public.schedule_assignments (org_id, subject_type, subject_person_id, site_location_id, schedule_pattern_id, start_date, status, is_primary) '
        'VALUES (%L, ''staff'', %L, %L, %L, DATE ''2025-06-01'', ''active'', true)',
        (SELECT org_a FROM cert_ctx), pg_temp.cert_id('person_a'),
        (SELECT site_a FROM cert_ctx), (SELECT pattern_a FROM cert_ctx)
    )
);

-- ---------------------------------------------------------------------------
-- C7 — staff assignment accepted inside the employment window
-- ---------------------------------------------------------------------------
WITH ins AS (
    INSERT INTO public.schedule_assignments (org_id, subject_type, subject_person_id, site_location_id,
                                             schedule_pattern_id, start_date, status, is_primary)
    SELECT org_a, 'staff', pg_temp.cert_id('person_a'), site_a, pattern_a,
           DATE '2026-02-01', 'active', true
    FROM cert_ctx
    RETURNING id
) INSERT INTO cert_ids SELECT 'assignment1', id FROM ins;

SELECT pg_temp.expect(
    'C7 staff assignment accepted with covering employment',
    EXISTS (SELECT 1 FROM public.schedule_assignments WHERE id = pg_temp.cert_id('assignment1'))
);

-- ---------------------------------------------------------------------------
-- C4 — end employment (history preserving)
-- ---------------------------------------------------------------------------
UPDATE public.employments
   SET employment_status = 'ended', end_date = DATE '2026-06-30', end_reason_key = 'resigned'
 WHERE id = pg_temp.cert_id('emp1');

SELECT pg_temp.expect(
    'C4 ended employment preserves the original row and its start date',
    (SELECT start_date = DATE '2026-01-01' AND end_date = DATE '2026-06-30'
       FROM public.employments WHERE id = pg_temp.cert_id('emp1'))
);

-- ---------------------------------------------------------------------------
-- C5 — effective-time authority
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect(
    'C5 employed on a date inside the ended window',
    public.person_is_employed_on((SELECT org_a FROM cert_ctx), pg_temp.cert_id('person_a'), DATE '2026-02-01')
);
SELECT pg_temp.expect(
    'C5 NOT employed on a date after the window closed',
    NOT public.person_is_employed_on((SELECT org_a FROM cert_ctx), pg_temp.cert_id('person_a'), DATE '2026-07-01')
);

-- ---------------------------------------------------------------------------
-- C8 — new assignment after employment ended is rejected
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_fail(
    'C8 new staff assignment after employment ended is rejected',
    format(
        'INSERT INTO public.schedule_assignments (org_id, subject_type, subject_person_id, site_location_id, schedule_pattern_id, start_date, status, is_primary) '
        'VALUES (%L, ''staff'', %L, %L, %L, DATE ''2026-07-01'', ''active'', false)',
        (SELECT org_a FROM cert_ctx), pg_temp.cert_id('person_a'),
        (SELECT site_a FROM cert_ctx), (SELECT pattern_a FROM cert_ctx)
    )
);

-- ---------------------------------------------------------------------------
-- C9 — the historical assignment survives, and stays updatable
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect(
    'C9 historical staff assignment still exists after employment ended',
    EXISTS (SELECT 1 FROM public.schedule_assignments WHERE id = pg_temp.cert_id('assignment1'))
);

UPDATE public.schedule_assignments
   SET status = 'ended', end_date = DATE '2026-06-30'
 WHERE id = pg_temp.cert_id('assignment1');

SELECT pg_temp.expect(
    'C9 historical staff assignment can still be closed out after employment ended',
    (SELECT status = 'ended' FROM public.schedule_assignments WHERE id = pg_temp.cert_id('assignment1'))
);

-- ---------------------------------------------------------------------------
-- C3 — rehire: a non-overlapping later period is allowed, history intact
-- ---------------------------------------------------------------------------
WITH ins AS (
    INSERT INTO public.employments (org_id, person_id, position_id, employment_status, start_date,
                                    supersedes_employment_id)
    SELECT org_a, pg_temp.cert_id('person_a'), pg_temp.cert_id('position_a'), 'active',
           DATE '2026-09-01', pg_temp.cert_id('emp1')
    FROM cert_ctx
    RETURNING id
) INSERT INTO cert_ids SELECT 'emp2', id FROM ins;

SELECT pg_temp.expect(
    'C3 rehire creates a second period and both remain queryable',
    (SELECT count(*) = 2 FROM public.employments
      WHERE org_id = (SELECT org_a FROM cert_ctx) AND person_id = pg_temp.cert_id('person_a'))
);
SELECT pg_temp.expect(
    'C3 the original ended period is unchanged by the rehire',
    (SELECT start_date = DATE '2026-01-01' AND end_date = DATE '2026-06-30' AND employment_status = 'ended'
       FROM public.employments WHERE id = pg_temp.cert_id('emp1'))
);

-- Employment in a second org for the SAME person is not identity corruption.
-- (Uses org_b's own person to respect the org-scope invariant proven in C1.)
INSERT INTO public.employments (org_id, person_id, employment_status, start_date)
SELECT org_b, pg_temp.cert_id('person_b'), 'active', DATE '2026-01-01' FROM cert_ctx;

SELECT pg_temp.expect(
    'C1 employment rows stay partitioned by org',
    (SELECT count(*) = 1 FROM public.employments WHERE org_id = (SELECT org_b FROM cert_ctx))
);

\echo ''
\echo '================================================'
\echo ' employment_foundation_cert: ALL CHECKS PASSED'
\echo '================================================'

ROLLBACK;
