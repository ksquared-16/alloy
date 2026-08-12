-- Staff presence + planned-vs-actual staffing — database certification (Phase 4)
-- =============================================================================
-- Runs inside one transaction and ROLLS BACK. Safe against the shared local stack.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/employment/staff_presence_cert.sql
--
--   P1  presence is append-only — UPDATE and DELETE are both rejected
--   P2  presence outside the employment window is rejected (before / after)
--   P3  presence inside the employment window is accepted
--   P4  a correction preserves the original and references it
--   P5  a reversal preserves history and is itself never effective
--   P6  effective-fact replay is deterministic and matches the fold's rule
--   P7  cross-org presence authoring is rejected
--   P8  a room outside the presence site is rejected
--   P9  a correction targeting another person's fact is rejected
--   P10 scheduled ≠ present: a staff assignment authors no presence fact
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = notice;

CREATE TEMP TABLE ctx AS
SELECT
    '00000000-0000-4000-8000-000000000001'::uuid AS org_a,
    'cccccccc-0000-4000-8000-00000000c001'::uuid AS org_b,
    '00000000-0000-4000-8000-000000000010'::uuid AS site_a,
    '00000000-0000-4000-8000-000000000011'::uuid AS site_b,
    '00000000-0000-4000-8000-000000000013'::uuid AS room_a,
    '00000000-0000-4000-8000-000050000040'::uuid AS pattern_a;

CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);

WITH ins AS (
    INSERT INTO public.persons (org_id, first_name, last_name, full_name)
    SELECT org_a, 'Presence', 'Cert-A', 'Presence Cert-A' FROM ctx RETURNING id
) INSERT INTO ids SELECT 'person_a', id FROM ins;

WITH ins AS (
    INSERT INTO public.persons (org_id, first_name, last_name, full_name)
    SELECT org_a, 'Presence', 'Cert-B', 'Presence Cert-B' FROM ctx RETURNING id
) INSERT INTO ids SELECT 'person_b', id FROM ins;

CREATE OR REPLACE FUNCTION pg_temp.id(k text) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT v FROM ids WHERE ids.k = $1 $$;

-- Employment window: 2026-08-01 .. 2026-08-31
WITH ins AS (
    INSERT INTO public.employments (org_id, person_id, employment_status, start_date, end_date)
    SELECT org_a, pg_temp.id('person_a'), 'ending', DATE '2026-08-01', DATE '2026-08-31' FROM ctx
    RETURNING id
) INSERT INTO ids SELECT 'emp_a', id FROM ins;

WITH ins AS (
    INSERT INTO public.employments (org_id, person_id, employment_status, start_date)
    SELECT org_a, pg_temp.id('person_b'), 'active', DATE '2026-08-01' FROM ctx RETURNING id
) INSERT INTO ids SELECT 'emp_b', id FROM ins;

CREATE OR REPLACE FUNCTION pg_temp.expect_fail(p_label text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN EXECUTE p_sql;
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'PASS  %  (rejected: %)', p_label, left(SQLERRM, 80); RETURN;
    END;
    RAISE EXCEPTION 'FAIL  % — accepted but must be rejected', p_label;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.expect(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF p_cond THEN RAISE NOTICE 'PASS  %', p_label;
    ELSE RAISE EXCEPTION 'FAIL  %', p_label; END IF;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.presence_sql(
    p_person uuid, p_emp uuid, p_date text, p_kind text, p_room uuid, p_at text
) RETURNS text LANGUAGE sql STABLE AS $$
    SELECT format(
        'INSERT INTO public.staff_presence_events (org_id, person_id, employment_id, site_location_id, room_location_id, event_kind, service_date, event_at, actor_type) '
        'VALUES (%L, %L, %L, %L, %s, %L, %L::date, %L::timestamptz, ''operator'')',
        (SELECT org_a FROM ctx), p_person, p_emp, (SELECT site_a FROM ctx),
        CASE WHEN p_room IS NULL THEN 'NULL' ELSE quote_literal(p_room) END,
        p_kind, p_date, p_at);
$$;

-- ===========================================================================
-- P2 — employment window bounds
-- ===========================================================================
SELECT pg_temp.expect_fail('P2 presence BEFORE employment start rejected',
    pg_temp.presence_sql(pg_temp.id('person_a'), pg_temp.id('emp_a'), '2026-07-31', 'check_in',
        (SELECT room_a FROM ctx), '2026-07-31T08:00:00Z'));

SELECT pg_temp.expect_fail('P2 presence AFTER employment end rejected',
    pg_temp.presence_sql(pg_temp.id('person_a'), pg_temp.id('emp_a'), '2026-09-01', 'check_in',
        (SELECT room_a FROM ctx), '2026-09-01T08:00:00Z'));

-- ===========================================================================
-- P3 — inside the window is accepted
-- ===========================================================================
WITH ins AS (
    INSERT INTO public.staff_presence_events
        (org_id, person_id, employment_id, site_location_id, room_location_id, event_kind, service_date, event_at, actor_type)
    SELECT org_a, pg_temp.id('person_a'), pg_temp.id('emp_a'), site_a, room_a,
           'check_in', DATE '2026-08-17', TIMESTAMPTZ '2026-08-17T08:10:00Z', 'operator'
    FROM ctx RETURNING id
) INSERT INTO ids SELECT 'ev_checkin', id FROM ins;

SELECT pg_temp.expect('P3 presence inside the employment window accepted',
    EXISTS (SELECT 1 FROM public.staff_presence_events WHERE id = pg_temp.id('ev_checkin')));

-- ===========================================================================
-- P1 — append-only
-- ===========================================================================
SELECT pg_temp.expect_fail('P1 UPDATE on a presence fact rejected',
    format('UPDATE public.staff_presence_events SET note = ''tampered'' WHERE id = %L', pg_temp.id('ev_checkin')));
SELECT pg_temp.expect_fail('P1 DELETE on a presence fact rejected',
    format('DELETE FROM public.staff_presence_events WHERE id = %L', pg_temp.id('ev_checkin')));

-- ===========================================================================
-- P4 — correction preserves the original and references it
-- ===========================================================================
WITH ins AS (
    INSERT INTO public.staff_presence_events
        (org_id, person_id, employment_id, site_location_id, room_location_id, event_kind,
         entry_type, corrects_event_id, service_date, event_at, actor_type)
    SELECT org_a, pg_temp.id('person_a'), pg_temp.id('emp_a'), site_a, room_a,
           'check_in', 'correction', pg_temp.id('ev_checkin'), DATE '2026-08-17',
           TIMESTAMPTZ '2026-08-17T07:55:00Z', 'operator'
    FROM ctx RETURNING id
) INSERT INTO ids SELECT 'ev_correction', id FROM ins;

SELECT pg_temp.expect('P4 original fact still exists unchanged at 08:10',
    (SELECT event_at = TIMESTAMPTZ '2026-08-17T08:10:00Z'
       FROM public.staff_presence_events WHERE id = pg_temp.id('ev_checkin')));
SELECT pg_temp.expect('P4 correction references the original',
    (SELECT corrects_event_id = pg_temp.id('ev_checkin')
       FROM public.staff_presence_events WHERE id = pg_temp.id('ev_correction')));

-- ===========================================================================
-- P6 — deterministic replay: effective = not superseded and not a reversal
-- ===========================================================================
CREATE OR REPLACE VIEW pg_temp.effective_presence AS
SELECT e.*
  FROM public.staff_presence_events e
 WHERE e.entry_type <> 'reversal'
   AND NOT EXISTS (
        SELECT 1 FROM public.staff_presence_events s
         WHERE s.corrects_event_id = e.id AND s.entry_type IN ('correction','reversal'));

SELECT pg_temp.expect('P6 corrected arrival replays as 07:55, not 08:10',
    (SELECT count(*) = 1 FROM pg_temp.effective_presence
      WHERE person_id = pg_temp.id('person_a') AND event_at = TIMESTAMPTZ '2026-08-17T07:55:00Z'));
SELECT pg_temp.expect('P6 superseded original is not effective',
    NOT EXISTS (SELECT 1 FROM pg_temp.effective_presence WHERE id = pg_temp.id('ev_checkin')));

-- ===========================================================================
-- P5 — reversal preserves history, contributes nothing
-- ===========================================================================
INSERT INTO public.staff_presence_events
    (org_id, person_id, employment_id, site_location_id, event_kind,
     entry_type, corrects_event_id, service_date, event_at, actor_type)
SELECT org_a, pg_temp.id('person_a'), pg_temp.id('emp_a'), site_a,
       'check_in', 'reversal', pg_temp.id('ev_correction'), DATE '2026-08-17',
       TIMESTAMPTZ '2026-08-17T09:00:00Z', 'operator'
FROM ctx;

SELECT pg_temp.expect('P5 reversed fact remains in history',
    EXISTS (SELECT 1 FROM public.staff_presence_events WHERE id = pg_temp.id('ev_correction')));
SELECT pg_temp.expect('P5 nothing is effective for this person after the reversal',
    NOT EXISTS (SELECT 1 FROM pg_temp.effective_presence WHERE person_id = pg_temp.id('person_a')));
SELECT pg_temp.expect('P5 full lineage preserved (3 rows: original, correction, reversal)',
    (SELECT count(*) = 3 FROM public.staff_presence_events WHERE person_id = pg_temp.id('person_a')));

-- ===========================================================================
-- P7 / P8 / P9 — scope and integrity
-- ===========================================================================
SELECT pg_temp.expect_fail('P7 cross-org employment rejected',
    format('INSERT INTO public.staff_presence_events (org_id, person_id, employment_id, site_location_id, room_location_id, event_kind, service_date, event_at, actor_type) '
           'VALUES (%L, %L, %L, %L, %L, ''check_in'', DATE ''2026-08-17'', TIMESTAMPTZ ''2026-08-17T08:00:00Z'', ''operator'')',
           (SELECT org_b FROM ctx), pg_temp.id('person_a'), pg_temp.id('emp_a'),
           (SELECT site_a FROM ctx), (SELECT room_a FROM ctx)));

SELECT pg_temp.expect_fail('P8 room outside the presence site rejected',
    format('INSERT INTO public.staff_presence_events (org_id, person_id, employment_id, site_location_id, room_location_id, event_kind, service_date, event_at, actor_type) '
           'VALUES (%L, %L, %L, %L, %L, ''check_in'', DATE ''2026-08-17'', TIMESTAMPTZ ''2026-08-17T08:00:00Z'', ''operator'')',
           (SELECT org_a FROM ctx), pg_temp.id('person_a'), pg_temp.id('emp_a'),
           (SELECT site_b FROM ctx), (SELECT room_a FROM ctx)));

SELECT pg_temp.expect_fail('P9 correction targeting another person''s fact rejected',
    format('INSERT INTO public.staff_presence_events (org_id, person_id, employment_id, site_location_id, room_location_id, event_kind, entry_type, corrects_event_id, service_date, event_at, actor_type) '
           'VALUES (%L, %L, %L, %L, %L, ''check_in'', ''correction'', %L, DATE ''2026-08-17'', TIMESTAMPTZ ''2026-08-17T08:00:00Z'', ''operator'')',
           (SELECT org_a FROM ctx), pg_temp.id('person_b'), pg_temp.id('emp_b'),
           (SELECT site_a FROM ctx), (SELECT room_a FROM ctx), pg_temp.id('ev_checkin')));

-- ===========================================================================
-- P10 — a schedule is not presence
-- ===========================================================================
INSERT INTO public.schedule_assignments
    (org_id, subject_type, subject_person_id, site_location_id, room_location_id,
     schedule_pattern_id, start_date, status, is_primary)
SELECT org_a, 'staff', pg_temp.id('person_b'), site_a, room_a, pattern_a,
       DATE '2026-08-17', 'active', false
FROM ctx;

SELECT pg_temp.expect('P10 scheduled staff authored ZERO presence facts',
    NOT EXISTS (SELECT 1 FROM public.staff_presence_events WHERE person_id = pg_temp.id('person_b')));

\echo ''
\echo '=================================================='
\echo ' staff_presence_cert: ALL CHECKS PASSED'
\echo '=================================================='

ROLLBACK;
