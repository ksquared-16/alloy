-- Employment foundation — NEGATIVE CONTROLS (Staff Foundation Phase 1)
-- =============================================================================
-- A passing certification is only evidence if it would fail when the thing it
-- claims to prove is broken. This script breaks each control on purpose inside
-- one transaction, asserts the certification now FAILS, and ROLLS BACK.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/employment/employment_negative_controls.sql
--
--   NC1  revert staff eligibility to persons.is_employee
--        → a person with is_employee=true and NO employment is admitted
--        → the scheduling-convergence certification would pass vacuously
--
--   NC2  bypass org scoping in the employment consistency trigger
--        → a person from another org can be employed
--        → the tenancy certification would pass vacuously
--
-- Every object mutated here is restored by ROLLBACK. Nothing is left behind.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL client_min_messages = notice;

CREATE TEMP TABLE nc_ctx AS
SELECT
    '00000000-0000-4000-8000-000000000001'::uuid AS org_a,
    'cccccccc-0000-4000-8000-00000000c001'::uuid AS org_b,
    '00000000-0000-4000-8000-000000000010'::uuid AS site_a,
    '00000000-0000-4000-8000-000050000040'::uuid AS pattern_a;

CREATE TEMP TABLE nc_ids (k text PRIMARY KEY, v uuid);

WITH ins AS (
    INSERT INTO public.persons (org_id, first_name, last_name, full_name, is_employee)
    SELECT org_a, 'Negative', 'Control-A', 'Negative Control-A', true FROM nc_ctx
    RETURNING id
) INSERT INTO nc_ids SELECT 'person_a', id FROM ins;

WITH ins AS (
    INSERT INTO public.persons (org_id, first_name, last_name, full_name)
    SELECT org_b, 'Negative', 'Control-B', 'Negative Control-B' FROM nc_ctx
    RETURNING id
) INSERT INTO nc_ids SELECT 'person_b', id FROM ins;

CREATE OR REPLACE FUNCTION pg_temp.nc_id(p_k text) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT v FROM nc_ids WHERE k = p_k $$;

/**
 * Runs a statement and reports whether it was ACCEPTED. A negative control
 * passes when the broken build accepts what the correct build rejects.
 */
CREATE OR REPLACE FUNCTION pg_temp.accepted(p_sql text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN others THEN
        RETURN false;
    END;
    RETURN true;
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

CREATE OR REPLACE FUNCTION pg_temp.staff_assignment_sql(p_start text)
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT format(
        'INSERT INTO public.schedule_assignments (org_id, subject_type, subject_person_id, site_location_id, schedule_pattern_id, start_date, status, is_primary) '
        'VALUES (%L, ''staff'', %L, %L, %L, %L::date, ''active'', false)',
        (SELECT org_a FROM nc_ctx), pg_temp.nc_id('person_a'),
        (SELECT site_a FROM nc_ctx), (SELECT pattern_a FROM nc_ctx), p_start
    );
$$;

-- ===========================================================================
-- Baseline: with the shipped controls, both must be REJECTED.
-- ===========================================================================
SELECT pg_temp.expect(
    'baseline: staff assignment rejected (is_employee=true, no employment)',
    NOT pg_temp.accepted(pg_temp.staff_assignment_sql('2026-02-01'))
);

SELECT pg_temp.expect(
    'baseline: cross-org employment rejected',
    NOT pg_temp.accepted(format(
        'INSERT INTO public.employments (org_id, person_id, start_date) VALUES (%L, %L, DATE ''2026-01-01'')',
        (SELECT org_a FROM nc_ctx), pg_temp.nc_id('person_b')
    ))
);

-- ===========================================================================
-- NC1 — revert eligibility to persons.is_employee
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.validate_schedule_assignments_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_pattern_org uuid;
  v_pattern_site uuid;
  v_person_org uuid;
  v_person_is_employee boolean;
BEGIN
  SELECT org_id, site_location_id INTO v_pattern_org, v_pattern_site
  FROM public.schedule_patterns WHERE id = NEW.schedule_pattern_id;
  IF v_pattern_org IS NULL OR v_pattern_org <> NEW.org_id THEN
    RAISE EXCEPTION 'Schedule pattern must belong to the assignment organization';
  END IF;

  IF NEW.subject_type = 'staff' THEN
    -- THE REVERTED (BROKEN) RULE
    SELECT org_id, is_employee INTO v_person_org, v_person_is_employee
    FROM public.persons WHERE id = NEW.subject_person_id;
    IF v_person_org IS NULL OR v_person_org <> NEW.org_id OR v_person_is_employee IS NOT TRUE THEN
      RAISE EXCEPTION 'Staff subject must be an active employee in the assignment organization';
    END IF;
  END IF;

  IF NEW.site_location_id IS NULL OR v_pattern_site <> NEW.site_location_id THEN
    RAISE EXCEPTION 'Schedule pattern must belong to the assignment site';
  END IF;
  RETURN NEW;
END;
$$;

SELECT pg_temp.expect(
    'NC1 reverting to persons.is_employee ADMITS a person with no employment — certification would pass vacuously',
    pg_temp.accepted(pg_temp.staff_assignment_sql('2026-02-02'))
);

-- ===========================================================================
-- NC2 — bypass org scoping on employment
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.validate_employments_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    -- THE BYPASSED (BROKEN) RULE: no org check at all.
    RETURN NEW;
END;
$$;

SELECT pg_temp.expect(
    'NC2 bypassing org scope ADMITS a cross-org person — tenancy certification would pass vacuously',
    pg_temp.accepted(format(
        'INSERT INTO public.employments (org_id, person_id, start_date) VALUES (%L, %L, DATE ''2026-01-01'')',
        (SELECT org_a FROM nc_ctx), pg_temp.nc_id('person_b')
    ))
);

\echo ''
\echo '======================================================='
\echo ' negative controls: both controls proven load-bearing'
\echo ' (rolling back — every mutated function is restored)'
\echo '======================================================='

ROLLBACK;
