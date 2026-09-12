-- =============================================================================
-- W-6 / M1 — PARSE-CHECK HARNESS. Discharges residual risk R2.
-- =============================================================================
-- NOT A MIGRATION. Do not put this in supabase/migrations/. It exists to prove
-- that 20260807140000_backfill_membership_access_profiles.sql PARSES, which no
-- PostgreSQL has ever done — R2, recorded since 2026-08-07 as "the largest
-- remaining avoidable cost in W-6" because a syntax error in the DO block would
-- otherwise surface only after the operator authorizes the apply, burning the
-- authorization round trip.
--
-- WHAT IT DOES. Wraps the migration body in a transaction that ALWAYS ROLLBACKs.
-- It commits nothing and mutates nothing. The timeouts stop a lock from stalling
-- other lease-holders on the shared cert stack.
--
-- THE BODY BELOW IS BYTE-IDENTICAL to migration lines 1-169 — specifically,
-- lines 43-211 of this file, verified by `diff` on 2026-09-11 (empty output).
-- The migration's remaining lines are its trailing comment block, which carries
-- the Tier A anti-join as commented-out text; that query is reproduced live at
-- the end of this file so it is parsed too. IF YOU EDIT THE MIGRATION, RE-COPY
-- THE BODY — a harness that has drifted proves nothing about the file that ships.
--
-- HOW TO RUN (needs one operator approval for the docker exec):
--   docker exec -i supabase_db_alloy-cert psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < docs/platform/planning/vacilando-os/qa/\
--     access-identity-v2/w6-m1-parsecheck.sql
--
-- HOW TO READ THE RESULT.
--   * Clean run ending "ROLLBACK" -> the DO block parses and executes. R2 is
--     DISCHARGED. Record it in w6-m1-preflight.json -> residual_risks[R2].
--   * A syntax/plpgsql compile error -> R2 has FIRED and caught a real defect
--     before it cost an apply authorization. Fix the migration, re-copy, re-run.
--   * A "W-6/M1 aborted: ..." RAISE -> the SQL is FINE; a post-condition failed
--     against the cert tenant's data. That is the backstop working as designed
--     and is NOT a parse failure. R2 is still discharged.
--
-- The counts this prints are the CERT stack's, not the deployed target's. They
-- are not preflight evidence and must never be copied into the preflight census.
-- =============================================================================
SET lock_timeout='5s';
SET statement_timeout='30s';
SET client_min_messages=notice;
BEGIN;
-- =============================================================================
-- W-6 / M1 — Backfill access profiles for memberships lacking one
-- =============================================================================
-- Closes the L1 remediation population. `resolveAdminAccessCore.ts:144-162`
-- infers BOTH scopes = 'all' when the (user_id, org_id) profile row is absent,
-- so every membership without a profile is silently unrestricted. W-0 Q4
-- measures that population; this migration empties it.
--
-- The backfill writes department_scope = 'all' and site_scope = 'all' — exactly
-- what the resolver already infers for these principals, and exactly what W-5's
-- `create_membership_with_access_profile` writes for new memberships. NO
-- PRINCIPAL'S EFFECTIVE ACCESS CHANGES. Behaviour is unchanged by construction,
-- which is what makes this safe to apply BEFORE W-7 flips absent-scope to deny.
--
-- This is step 1 of the L1 ritual (plan §2). It does NOT flip the resolver
-- fallback (W-7) and does NOT remove the department-scope bypass (W-8).
--
-- Idempotent: ON CONFLICT DO NOTHING, never DO UPDATE. Re-running creates zero
-- rows and modifies nothing.
--
-- Predecessor: `20260504103000_user_access_scope_tables_v1.sql:272-275` ran the
-- same anti-join at table-creation time. Everything this migration finds is a
-- membership created SINCE that date through a path that wrote no profile —
-- the fail-open W-5 closed on 2026-08-07.
--
-- GRAIN. `user_roles` is per (user, org, role); `user_access_profiles` is
-- UNIQUE (user_id, org_id). The row count created here is DISTINCT (user, org)
-- PAIRS LACKING A PROFILE — not membership rows and not distinct pairs. W-0's
-- census reports all three because they are different numbers.
-- =============================================================================

DO $$
DECLARE
    v_pairs_without_profile_before integer;
    v_profile_rows_before          integer;
    v_orphan_profiles_before       integer;
    v_membership_rows              integer;
    v_distinct_pairs               integer;
    v_created                      integer;
    v_pairs_without_profile_after  integer;
    v_profile_rows_after           integer;
    v_orphan_profiles_after        integer;
    v_mutated_existing_rows        integer;
BEGIN
    -- -------------------------------------------------------------------------
    -- Pre-state. These are the same expressions W-0 Q4 runs, so the numbers
    -- recorded here are directly comparable to the preflight census.
    -- -------------------------------------------------------------------------
    SELECT count(*) INTO v_membership_rows FROM public.user_roles;

    SELECT count(*) INTO v_distinct_pairs
    FROM (SELECT DISTINCT ur.user_id, ur.org_id FROM public.user_roles ur) mp;

    SELECT count(*) INTO v_pairs_without_profile_before
    FROM (SELECT DISTINCT ur.user_id, ur.org_id FROM public.user_roles ur) mp
    LEFT JOIN public.user_access_profiles p
        ON p.user_id = mp.user_id AND p.org_id = mp.org_id
    WHERE p.id IS NULL;

    SELECT count(*) INTO v_profile_rows_before FROM public.user_access_profiles;

    SELECT count(*) INTO v_orphan_profiles_before
    FROM public.user_access_profiles p
    WHERE NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id AND ur.org_id = p.org_id
    );

    -- Snapshot every pre-existing profile row. "No existing profile row
    -- modified" is then EVIDENCED by comparison rather than argued from
    -- ON CONFLICT DO NOTHING's semantics.
    CREATE TEMP TABLE _m1_profiles_before ON COMMIT DROP AS
    SELECT p.id, p.user_id, p.org_id, p.department_scope, p.site_scope,
           p.created_at, p.updated_at
    FROM public.user_access_profiles p;

    -- -------------------------------------------------------------------------
    -- The backfill. Additive only.
    -- -------------------------------------------------------------------------
    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope)
    SELECT DISTINCT ur.user_id, ur.org_id, 'all'::text, 'all'::text
    FROM public.user_roles ur
    ON CONFLICT (user_id, org_id) DO NOTHING;

    GET DIAGNOSTICS v_created = ROW_COUNT;

    -- -------------------------------------------------------------------------
    -- Post-state + the four post-conditions. Any failure aborts the migration;
    -- because this runs inside the migration transaction, a failed assertion
    -- leaves the database exactly as it was.
    -- -------------------------------------------------------------------------
    SELECT count(*) INTO v_pairs_without_profile_after
    FROM (SELECT DISTINCT ur.user_id, ur.org_id FROM public.user_roles ur) mp
    LEFT JOIN public.user_access_profiles p
        ON p.user_id = mp.user_id AND p.org_id = mp.org_id
    WHERE p.id IS NULL;

    SELECT count(*) INTO v_profile_rows_after FROM public.user_access_profiles;

    SELECT count(*) INTO v_orphan_profiles_after
    FROM public.user_access_profiles p
    WHERE NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id AND ur.org_id = p.org_id
    );

    SELECT count(*) INTO v_mutated_existing_rows
    FROM (
        SELECT id, user_id, org_id, department_scope, site_scope, created_at, updated_at
        FROM _m1_profiles_before
        EXCEPT
        SELECT p.id, p.user_id, p.org_id, p.department_scope, p.site_scope,
               p.created_at, p.updated_at
        FROM public.user_access_profiles p
    ) diff;

    -- (1) Rows created == the anti-join count measured immediately before.
    --     This is the in-transaction restatement of §11's "row count == W-0 Q4";
    --     the preflight census proves the same number outside the transaction.
    IF v_created <> v_pairs_without_profile_before THEN
        RAISE EXCEPTION
            'W-6/M1 aborted: created % profile rows but % membership pairs lacked one',
            v_created, v_pairs_without_profile_before;
    END IF;

    -- (2) Zero memberships left uncovered. This is W-6's exit criterion and
    --     W-7's precondition.
    IF v_pairs_without_profile_after <> 0 THEN
        RAISE EXCEPTION
            'W-6/M1 aborted: % membership pairs still lack an access profile',
            v_pairs_without_profile_after;
    END IF;

    -- (3) No existing profile row modified — evidenced, not asserted.
    IF v_mutated_existing_rows <> 0 THEN
        RAISE EXCEPTION
            'W-6/M1 aborted: % pre-existing profile rows were modified or deleted',
            v_mutated_existing_rows;
    END IF;

    -- (4) The only change to the table is the insert: total grew by exactly the
    --     created count, and the orphan population (profiles with no membership)
    --     is untouched. W-0 measured 0 orphans; this holds whatever that is.
    IF v_profile_rows_after <> v_profile_rows_before + v_created THEN
        RAISE EXCEPTION
            'W-6/M1 aborted: profile rows went % -> % after creating %',
            v_profile_rows_before, v_profile_rows_after, v_created;
    END IF;

    IF v_orphan_profiles_after <> v_orphan_profiles_before THEN
        RAISE EXCEPTION
            'W-6/M1 aborted: orphan profile rows went % -> %',
            v_orphan_profiles_before, v_orphan_profiles_after;
    END IF;

    -- -------------------------------------------------------------------------
    -- Tier A post-apply evidence. Capture this NOTICE block into the evidence
    -- file named by §11's `preflight.evidence_path`.
    -- -------------------------------------------------------------------------
    RAISE NOTICE 'W-6/M1 backfill complete.';
    RAISE NOTICE '  membership_rows                = %', v_membership_rows;
    RAISE NOTICE '  distinct_user_org_pairs        = %', v_distinct_pairs;
    RAISE NOTICE '  pairs_without_profile_before   = %', v_pairs_without_profile_before;
    RAISE NOTICE '  profile_rows_created           = %', v_created;
    RAISE NOTICE '  pairs_without_profile_after    = % (must be 0)', v_pairs_without_profile_after;
    RAISE NOTICE '  profile_rows_before -> after   = % -> %', v_profile_rows_before, v_profile_rows_after;
    RAISE NOTICE '  orphan_profiles_before/after   = % / %', v_orphan_profiles_before, v_orphan_profiles_after;
    RAISE NOTICE '  pre_existing_rows_mutated      = % (must be 0)', v_mutated_existing_rows;
END$$;

SELECT count(*) AS pairs_without_profile_tier_a
FROM (SELECT DISTINCT ur.user_id, ur.org_id FROM public.user_roles ur) mp
LEFT JOIN public.user_access_profiles p
  ON p.user_id = mp.user_id AND p.org_id = mp.org_id
WHERE p.id IS NULL;

ROLLBACK;
