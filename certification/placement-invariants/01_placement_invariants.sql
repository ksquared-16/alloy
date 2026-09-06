-- =============================================================================
-- PLACEMENT INVARIANT CERTIFICATION
--
-- The database enforces placement correctness that application tests do not verify: three partial
-- unique indexes and a consistency trigger that both rejects cross-tenant rows and BACK-FILLS
-- identity columns the application relies on. Nothing in the TypeScript suite asserts any of it, so
-- a migration could relax it and every unit test would stay green.
--
-- These assertions exercise the real objects from the real migration. They deliberately do NOT
-- restate the constraints in test-only logic — each one provokes the database and checks that the
-- database is what refused.
-- =============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
    ORG_A  uuid := '11111111-1111-1111-1111-111111111111';
    ORG_B  uuid := '22222222-2222-2222-2222-222222222222';
    OPP    uuid := 'a0000000-0000-0000-0000-0000000000e1';
    OCM    uuid := 'a0000000-0000-0000-0000-0000000000a1';
    MEMBER uuid := 'a0000000-0000-0000-0000-0000000000d1';
    PERSON uuid := 'a0000000-0000-0000-0000-0000000000f1';
    SITE_A uuid := 'a0000000-0000-0000-0000-000000000001';
    SITE_B uuid := 'b0000000-0000-0000-0000-000000000001';
    c1 uuid;
    c2 uuid;
    got_person uuid;
    got_sqlstate text;
BEGIN
    -- ---------------------------------------------------------------------
    -- C. IDENTITY BACK-FILL
    -- The application inserts candidates without always supplying person_id and depends on the
    -- trigger to resolve it from customer_members. If that stops, rows arrive with a null identity
    -- and nothing in the app tests notices.
    -- ---------------------------------------------------------------------
    INSERT INTO public.placement_candidates
        (org_id, opportunity_id, opportunity_customer_member_id, customer_member_id,
         program_room_cohort_key, status, seed_key)
    VALUES (ORG_A, OPP, OCM, MEMBER, 'infant_0_18_months', 'active', 'seed:c-backfill')
    RETURNING id, person_id INTO c1, got_person;

    IF got_person IS DISTINCT FROM PERSON THEN
        RAISE EXCEPTION 'FAIL C: person_id not back-filled (got %, expected %)', got_person, PERSON;
    END IF;
    RAISE NOTICE ' PASS C: trigger back-fills person_id from customer_members';

    -- ---------------------------------------------------------------------
    -- A. CANDIDATE UNIQUENESS
    -- A second ACTIVE candidate for the same OCM + cohort must be refused by
    -- ux_placement_candidates_ocm_cohort_active.
    -- ---------------------------------------------------------------------
    BEGIN
        INSERT INTO public.placement_candidates
            (org_id, opportunity_id, opportunity_customer_member_id, customer_member_id,
             program_room_cohort_key, status, seed_key)
        VALUES (ORG_A, OPP, OCM, MEMBER, 'infant_0_18_months', 'active', 'seed:c-dupe');
        RAISE EXCEPTION 'FAIL A: a second active candidate for the same OCM+cohort was accepted';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE ' PASS A: duplicate active candidate for OCM+cohort rejected (%)', SQLSTATE;
    END;

    -- A2. The SAME subject in a DIFFERENT cohort is still accepted by the database.
    -- This is the documented gap: uniqueness is cohort-scoped in the schema while the application
    -- invariant is subject-scoped. Certified as CURRENT behaviour so a future narrowing is a
    -- deliberate, visible change rather than a silent one.
    INSERT INTO public.placement_candidates
        (org_id, opportunity_id, opportunity_customer_member_id, customer_member_id,
         program_room_cohort_key, status, seed_key)
    VALUES (ORG_A, OPP, OCM, MEMBER, 'toddler_2_3_years', 'active', 'seed:c-othercohort')
    RETURNING id INTO c2;
    RAISE NOTICE ' PASS A2: same subject in a different cohort is accepted — uniqueness is cohort-scoped (documented gap)';

    -- ---------------------------------------------------------------------
    -- E. LIFECYCLE — a withdrawn record must not block a lawful new active one.
    -- ---------------------------------------------------------------------
    UPDATE public.placement_candidates SET status = 'withdrawn' WHERE id = c2;
    INSERT INTO public.placement_candidates
        (org_id, opportunity_id, opportunity_customer_member_id, customer_member_id,
         program_room_cohort_key, status, seed_key)
    VALUES (ORG_A, OPP, OCM, MEMBER, 'toddler_2_3_years', 'active', 'seed:c-readmit');
    RAISE NOTICE ' PASS E: a withdrawn candidate does not block a lawful new active candidate';

    -- ---------------------------------------------------------------------
    -- D. ORG CONSISTENCY — cross-tenant rows are refused by the trigger, with a check violation.
    -- ---------------------------------------------------------------------
    BEGIN
        INSERT INTO public.placement_candidates
            (org_id, opportunity_id, program_room_cohort_key, status, seed_key, is_synthetic_fallback)
        VALUES (ORG_B, OPP, 'infant_0_18_months', 'active', 'seed:c-crossorg', true);
        RAISE EXCEPTION 'FAIL D: a candidate whose org disagrees with its opportunity was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE ' PASS D: cross-org candidate rejected with SQLSTATE % ', SQLSTATE;
    END;

    -- D2. A site belonging to another org is refused too.
    BEGIN
        INSERT INTO public.placement_candidates
            (org_id, opportunity_id, program_room_cohort_key, status, seed_key, site_id, is_synthetic_fallback)
        VALUES (ORG_A, OPP, 'school_age_5_years', 'active', 'seed:c-crosssite', SITE_B, true);
        RAISE EXCEPTION 'FAIL D2: a candidate carrying another org''s site was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE ' PASS D2: cross-org site rejected with SQLSTATE % ', SQLSTATE;
    END;

    -- D3. Seed keys are unique per org — the idempotency the ensure path relies on.
    BEGIN
        -- A lawful non-synthetic row (identity present, distinct cohort) that reuses a seed key.
        INSERT INTO public.placement_candidates
            (org_id, opportunity_id, opportunity_customer_member_id, customer_member_id,
             program_room_cohort_key, status, seed_key, site_id)
        VALUES (ORG_A, OPP, OCM, MEMBER, 'pre_k_4_5_years', 'active', 'seed:c-backfill', SITE_A);
        RAISE EXCEPTION 'FAIL D3: a duplicate seed_key was accepted within one org';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE ' PASS D3: duplicate seed_key within an org rejected (%)', SQLSTATE;
    END;

    -- ---------------------------------------------------------------------
    -- B. ONE ACTIVE MANUAL POSITION per candidate/cohort/kind.
    -- This is what stops two pins racing for one row's ordinal.
    -- ---------------------------------------------------------------------
    INSERT INTO public.placement_overrides
        (org_id, placement_candidate_id, program_room_cohort_key, override_kind, reason, payload,
         is_active, created_by)
    VALUES (ORG_A, c1, 'infant_0_18_months', 'pin', 'first pin', '{"pin_ordinal": 1}'::jsonb,
            true, PERSON);

    BEGIN
        INSERT INTO public.placement_overrides
            (org_id, placement_candidate_id, program_room_cohort_key, override_kind, reason, payload,
             is_active, created_by)
        VALUES (ORG_A, c1, 'infant_0_18_months', 'pin', 'second pin', '{"pin_ordinal": 2}'::jsonb,
                true, PERSON);
        RAISE EXCEPTION 'FAIL B: a second active pin for the same candidate+cohort was accepted';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE ' PASS B: second active pin for candidate+cohort rejected (%)', SQLSTATE;
    END;

    -- B2. Releasing the pin frees the slot — the reset path must be able to re-pin afterwards.
    UPDATE public.placement_overrides
       SET is_active = false, released_at = now()
     WHERE placement_candidate_id = c1 AND override_kind = 'pin' AND is_active = true;

    INSERT INTO public.placement_overrides
        (org_id, placement_candidate_id, program_room_cohort_key, override_kind, reason, payload,
         is_active, created_by)
    VALUES (ORG_A, c1, 'infant_0_18_months', 'pin', 're-pin after release', '{"pin_ordinal": 3}'::jsonb,
            true, PERSON);
    RAISE NOTICE ' PASS B2: a released pin frees the slot for a lawful new active pin';

    -- B3. A temporary override without expires_at is refused.
    BEGIN
        INSERT INTO public.placement_overrides
            (org_id, placement_candidate_id, program_room_cohort_key, override_kind, reason, payload,
             is_active, created_by)
        VALUES (ORG_A, c1, 'infant_0_18_months', 'temporary', 'no expiry', '{}'::jsonb, true, PERSON);
        RAISE EXCEPTION 'FAIL B3: a temporary override without expires_at was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE ' PASS B3: temporary override without expires_at rejected (%)', SQLSTATE;
    END;

    RAISE NOTICE ' PASS: placement invariant certification complete';
END $$;
