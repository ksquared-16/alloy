-- Interactive Tour — database certification for
-- 20260801120000_tour_invitation_and_scoped_public_actions.sql
--
-- Proves the migration's guarantees against real Postgres, not against a
-- hand-written approximation of it. The unit suites deliberately do NOT enforce
-- these constraints, so this file is the only place they are actually certified.
--
-- Run inside a transaction that is ROLLED BACK — it asserts, it does not seed.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f assert-tour-invitation-schema.sql
--
-- WHY REAL FIXTURES: an earlier attempt proved nothing because a fabricated
-- opportunity_id tripped a foreign key before the CHECK was ever reached. Every
-- fixture below is inserted for real and FK-resolvable, so a failure here is the
-- CHECK talking.

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE _results (ord serial, name text, ok boolean, detail text) ON COMMIT DROP;

-- Assert that `stmt` violates a constraint. Passing = the database refused it.
CREATE OR REPLACE FUNCTION pg_temp.expect_rejected(label text, stmt text) RETURNS void AS $fn$
BEGIN
    BEGIN
        EXECUTE stmt;
    EXCEPTION
        WHEN check_violation OR not_null_violation OR foreign_key_violation THEN
            INSERT INTO _results(name, ok, detail) VALUES (label, true, SQLERRM);
            RETURN;
    END;
    INSERT INTO _results(name, ok, detail) VALUES (label, false, 'STATEMENT WAS ACCEPTED — constraint absent');
END;
$fn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.expect_accepted(label text, stmt text) RETURNS void AS $fn$
BEGIN
    EXECUTE stmt;
    INSERT INTO _results(name, ok, detail) VALUES (label, true, 'accepted');
EXCEPTION WHEN OTHERS THEN
    INSERT INTO _results(name, ok, detail) VALUES (label, false, SQLERRM);
END;
$fn$ LANGUAGE plpgsql;

-- ── Real, FK-backed fixtures ────────────────────────────────────────────────
CREATE TEMP TABLE _fx (k text primary key, v uuid) ON COMMIT DROP;

INSERT INTO _fx(k, v)
SELECT 'org', id FROM public.orgs ORDER BY created_at LIMIT 1;

INSERT INTO _fx(k, v)
SELECT 'person', p.id FROM public.persons p WHERE p.org_id = (SELECT v FROM _fx WHERE k='org') LIMIT 1;

INSERT INTO _fx(k, v)
SELECT 'opportunity', o.id FROM public.opportunities o WHERE o.org_id = (SELECT v FROM _fx WHERE k='org') LIMIT 1;

INSERT INTO _fx(k, v)
SELECT 'location', l.id FROM public.locations l WHERE l.org_id = (SELECT v FROM _fx WHERE k='org') LIMIT 1;

DO $$
BEGIN
    IF (SELECT count(*) FROM _fx) < 4 THEN
        RAISE EXCEPTION 'seed incomplete: need org/person/opportunity/location fixtures (got %)', (SELECT count(*) FROM _fx);
    END IF;
END $$;

-- A real invitation to hang scoped links from.
INSERT INTO public.tour_invitations (id, org_id, recipient_person_id, opportunity_id, location_id, status, option_snapshot)
SELECT '00000000-dead-4000-8000-000000000001',
       (SELECT v FROM _fx WHERE k='org'),
       (SELECT v FROM _fx WHERE k='person'),
       (SELECT v FROM _fx WHERE k='opportunity'),
       (SELECT v FROM _fx WHERE k='location'),
       'active', '{}'::jsonb;

-- ── 1. tour_invitations: recipient authority is structural ──────────────────
SELECT pg_temp.expect_rejected(
    'tour_invitations rejects a NULL recipient_person_id',
    $q$INSERT INTO public.tour_invitations (org_id, recipient_person_id, opportunity_id, location_id, status, option_snapshot)
       SELECT (SELECT v FROM _fx WHERE k='org'), NULL,
              (SELECT v FROM _fx WHERE k='opportunity'), (SELECT v FROM _fx WHERE k='location'), 'active', '{}'::jsonb$q$);

SELECT pg_temp.expect_rejected(
    'tour_invitations rejects an arbitrary status',
    $q$INSERT INTO public.tour_invitations (org_id, recipient_person_id, opportunity_id, location_id, status, option_snapshot)
       SELECT (SELECT v FROM _fx WHERE k='org'), (SELECT v FROM _fx WHERE k='person'),
              (SELECT v FROM _fx WHERE k='opportunity'), (SELECT v FROM _fx WHERE k='location'), 'not_a_status', '{}'::jsonb$q$);

-- ── 2. A scoped link must carry FULL authority ──────────────────────────────
SELECT pg_temp.expect_rejected(
    'scoped link rejected without invitation_id',
    $q$INSERT INTO public.tour_public_booking_links
         (org_id, token_hash, token_prefix, opportunity_id, location_id, authorization_model, recipient_person_id, action_kind)
       SELECT (SELECT v FROM _fx WHERE k='org'), 'h_missing_inv', 'p1',
              (SELECT v FROM _fx WHERE k='opportunity'), (SELECT v FROM _fx WHERE k='location'),
              'scoped', (SELECT v FROM _fx WHERE k='person'), 'view_tour_slots'$q$);

SELECT pg_temp.expect_rejected(
    'scoped link rejected without recipient_person_id',
    $q$INSERT INTO public.tour_public_booking_links
         (org_id, token_hash, token_prefix, opportunity_id, location_id, authorization_model, invitation_id, action_kind)
       SELECT (SELECT v FROM _fx WHERE k='org'), 'h_missing_rcp', 'p2',
              (SELECT v FROM _fx WHERE k='opportunity'), (SELECT v FROM _fx WHERE k='location'),
              'scoped', '00000000-dead-4000-8000-000000000001', 'view_tour_slots'$q$);

SELECT pg_temp.expect_rejected(
    'scoped link rejected without action_kind',
    $q$INSERT INTO public.tour_public_booking_links
         (org_id, token_hash, token_prefix, opportunity_id, location_id, authorization_model, invitation_id, recipient_person_id)
       SELECT (SELECT v FROM _fx WHERE k='org'), 'h_missing_act', 'p3',
              (SELECT v FROM _fx WHERE k='opportunity'), (SELECT v FROM _fx WHERE k='location'),
              'scoped', '00000000-dead-4000-8000-000000000001', (SELECT v FROM _fx WHERE k='person')$q$);

-- ── 3. The action vocabulary is closed ──────────────────────────────────────
SELECT pg_temp.expect_rejected(
    'arbitrary action_kind rejected',
    $q$INSERT INTO public.tour_public_booking_links
         (org_id, token_hash, token_prefix, opportunity_id, location_id, authorization_model, invitation_id, recipient_person_id, action_kind)
       SELECT (SELECT v FROM _fx WHERE k='org'), 'h_bad_kind', 'p4',
              (SELECT v FROM _fx WHERE k='opportunity'), (SELECT v FROM _fx WHERE k='location'),
              'scoped', '00000000-dead-4000-8000-000000000001', (SELECT v FROM _fx WHERE k='person'), 'do_anything'$q$);

-- ── 4. Reuse budget is enforced ─────────────────────────────────────────────
SELECT pg_temp.expect_rejected(
    'use_count exceeding max_uses rejected',
    $q$INSERT INTO public.tour_public_booking_links
         (org_id, token_hash, token_prefix, opportunity_id, location_id, authorization_model, invitation_id, recipient_person_id, action_kind, use_count, max_uses)
       SELECT (SELECT v FROM _fx WHERE k='org'), 'h_overuse', 'p5',
              (SELECT v FROM _fx WHERE k='opportunity'), (SELECT v FROM _fx WHERE k='location'),
              'scoped', '00000000-dead-4000-8000-000000000001', (SELECT v FROM _fx WHERE k='person'), 'view_tour_slots', 5, 3$q$);

-- ── 5. The valid case is genuinely accepted ─────────────────────────────────
SELECT pg_temp.expect_accepted(
    'fully scoped link accepted',
    $q$INSERT INTO public.tour_public_booking_links
         (org_id, token_hash, token_prefix, opportunity_id, location_id, authorization_model, invitation_id, recipient_person_id, action_kind, use_count, max_uses)
       SELECT (SELECT v FROM _fx WHERE k='org'), 'h_valid', 'p6',
              (SELECT v FROM _fx WHERE k='opportunity'), (SELECT v FROM _fx WHERE k='location'),
              'scoped', '00000000-dead-4000-8000-000000000001', (SELECT v FROM _fx WHERE k='person'), 'view_tour_slots', 1, 50$q$);

-- ── 6. Structure that the authorizer depends on ─────────────────────────────
INSERT INTO _results(name, ok, detail)
SELECT 'all four Slice C indexes present', count(*) = 4, 'found ' || count(*)
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname IN ('idx_tour_links_invitation','idx_tour_links_recipient','idx_tour_links_booking','idx_tour_links_active_actions');

INSERT INTO _results(name, ok, detail)
SELECT 'all four Slice C constraints present', count(*) = 4, 'found ' || count(*)
  FROM pg_constraint
 WHERE conname IN ('tour_public_booking_links_action_kind_chk','tour_public_booking_links_auth_model_chk',
                   'tour_public_booking_links_scoped_complete_chk','tour_public_booking_links_use_count_chk');

INSERT INTO _results(name, ok, detail)
SELECT 'no legacy link is marked scoped', count(*) = 0, 'offending rows: ' || count(*)
  FROM public.tour_public_booking_links
 WHERE authorization_model = 'scoped'
   AND (invitation_id IS NULL OR recipient_person_id IS NULL OR action_kind IS NULL);

-- ── Report ──────────────────────────────────────────────────────────────────
SELECT CASE WHEN ok THEN 'PASS  ' ELSE 'FAIL  ' END || name AS result, detail
  FROM _results ORDER BY ord;

DO $$
DECLARE failed int;
BEGIN
    SELECT count(*) INTO failed FROM _results WHERE NOT ok;
    IF failed > 0 THEN
        RAISE EXCEPTION 'tour invitation schema certification FAILED (% assertion(s))', failed;
    END IF;
    RAISE NOTICE 'tour invitation schema certification PASSED (% assertions)', (SELECT count(*) FROM _results);
END $$;

ROLLBACK;
