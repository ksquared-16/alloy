-- ORG-PARAMETERIZED MUTATING RPC EXECUTE BOUNDARY
--
-- WHAT THIS CLOSES. `20260915160000` and `20260915170000` closed the RPC execute
-- boundary for one family: functions taking `p_actor_user_id`, and functions
-- writing `user_roles` or `role_permission_grants`. `access_rpc_boundary_report`
-- still scans for exactly that, and the live lock still asserts it is empty.
--
-- A second family was never in scope. Measured on the deployed primary
-- 2026-09-30 (census `identity-access-rpc-and-tenancy-census.sql`):
--
--   14 mutating functions in `public` are EXECUTE-granted to `authenticated`,
--   9 of them SECURITY DEFINER, and NOT ONE contains a caller-authority check of
--   any kind — no `auth.uid()`, no `auth.role()`, no `has_org_role`, no
--   `effective_capability_keys`. Every one takes the organization it acts on as a
--   PARAMETER.
--
-- SECURITY DEFINER is what makes that decisive. The table-grant drift recorded in
-- `rls-authority-model-director-gate.md` is latent because RLS still says no on the
-- write. A SECURITY DEFINER function never consults RLS at all: it runs as its
-- owner. So for those 9, `p_org_id` is the only tenancy there is, and the caller
-- supplies it.
--
-- WHY THE OLD SCAN MISSED THEM. Two near-misses, not an oversight of principle:
--
--   * `revoke_operational_authority_assignment(p_org_id, p_assignment_id, p_actor)`
--     takes an actor — spelled `p_actor`, where the scan matches `p_actor_user_id`.
--   * `grant_operational_authority_assignment` and `upsert_operational_authority`
--     write `operational_authority_assignments` / `operational_authorities` — a
--     SECOND authority table family, where the scan names `user_roles` and
--     `role_permission_grants`.
--
-- SEVERITY, HONESTLY SPLIT. The operational-authority functions write a table with
-- NO application reader (measured: zero callers outside its own migration), so that
-- subset is a latent escalation path, not a live one — it must be closed before
-- that model is switched on, not because it is being exploited now. What IS live:
--
--   * `execute_lead_status_mutation` and `execute_enrollment_status_mutation`
--     (SECURITY DEFINER) write governed lifecycle state — `opportunities.status_key`
--     and `opportunity_customer_members.outcome_status_key` — for any org named by
--     the caller. PRs 1338-1341 established that the canonical transition endpoint
--     is the only writer and `validateStatusTransition` the only gate. Both of those
--     are application-layer facts. These two functions bypass the route, the
--     capability check and the transition-policy gate together.
--   * `record_child_attendance_event` (SECURITY DEFINER) writes attendance facts.
--   * `apply_held_funds_atomic` shipped in 20261102120000 with EXECUTE to PUBLIC.
--     It is not SECURITY DEFINER, so RLS and table grants still apply to it — but
--     it is the proof that the 2026-09 prediction was right: "the next actor-taking
--     function will ship exposed by default."
--
-- WHY REVOKING IS SAFE. `service_role` keeps EXECUTE. Every supported caller is a
-- server module that receives an injected client from an API route, and 599 of 677
-- route files build that client with `createAdminClient` (service role). Only 9
-- non-test files construct or import a browser Supabase client; eight call
-- `supabase.auth.*` exclusively, and the ninth — `lib/pricing/supabasePricing.ts` —
-- calls the unrelated read-only `get_quote_pricing` and has zero callers. No
-- supported path executes any of these 14 as `authenticated`, so removing that
-- privilege cannot break one. Internal
-- function-to-function calls are unaffected: they run with the calling function's
-- privileges, not the client's.
--
-- WHY A LOOP AND NOT 14 SIGNATURES. Four of the signatures are long enough that the
-- census truncated them. A hand-transcribed signature that does not match silently
-- revokes nothing, and `REVOKE` on a non-existent function raises rather than
-- warning. The catalog already knows them; `oid::regprocedure` is exact by
-- construction. Same shape `20260915170000` used, for the same reason.

-- ---------------------------------------------------------------------------
-- 1. WIDEN THE REPORT so the existing live lock guards this family too.
--    Adds: any actor spelling, org-parameterized mutators, and the second
--    authority table family. The report stays the single subject the lock reads.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.access_rpc_boundary_report()
RETURNS TABLE(proname text, open_to_clients boolean, has_service_role boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $fn$
    SELECT p.proname::text,
           (
                p.proacl IS NULL
             OR array_to_string(p.proacl::text[], ',') ILIKE '%authenticated=X%'
             OR array_to_string(p.proacl::text[], ',') ILIKE '%anon=X%'
             OR array_to_string(p.proacl::text[], ',') ILIKE '%{=X%'
             OR array_to_string(p.proacl::text[], ',') ILIKE '%,=X%'
           ) AS open_to_clients,
           COALESCE(array_to_string(p.proacl::text[], ',') ILIKE '%service_role=X%', false) AS has_service_role
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       -- Plain functions only: pg_get_functiondef() raises on aggregates.
       AND p.prokind = 'f'
       -- Trigger functions are not reachable through PostgREST and must keep
       -- whatever privileges they have: `handle_new_user` is auth signup.
       AND p.prorettype <> 'trigger'::regtype
       AND (
            -- ORIGINAL SCOPE (unchanged).
            pg_get_function_identity_arguments(p.oid) ILIKE '%p_actor_user_id%'
         OR pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?role_permission_grants'
         OR pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?user_roles'
            -- WIDENED: the second authority table family. Write-predicated, so a
            -- reader of these tables is not swept in.
         OR pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?operational_authorit'
         OR pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?role_definitions'
            -- WIDENED: a caller-supplied organization OR actor on a function that
            -- MUTATES. The mutation requirement is load-bearing: `p_actor` alone
            -- would also match read-only functions that legitimately take an actor
            -- to report on, and closing those would be a widening dressed as a fix.
            -- This is the tenancy dimension the original scan had no term for, and
            -- the near-miss that let `revoke_operational_authority_assignment`
            -- through — it spells its actor `p_actor`, not `p_actor_user_id`.
         OR (
                p.provolatile = 'v'
            AND pg_get_functiondef(p.oid) ~* '\m(insert into|update |delete from)\M'
            AND (
                    pg_get_function_identity_arguments(p.oid) ~* '\mp_org_id\M'
                 OR pg_get_function_identity_arguments(p.oid) ~* '\mp_actor\M'
                )
            )
       );
$fn$;

REVOKE EXECUTE ON FUNCTION public.access_rpc_boundary_report() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.access_rpc_boundary_report() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.access_rpc_boundary_report() FROM anon;
GRANT  EXECUTE ON FUNCTION public.access_rpc_boundary_report() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. CLOSE the widened family. Idempotent: re-runnable, and functions already
--    closed by 20260915170000 are simply revoked again to no effect.
-- ---------------------------------------------------------------------------
DO $close$
DECLARE
    v_fn   record;
    v_n    int := 0;
BEGIN
    FOR v_fn IN
        SELECT p.oid::regprocedure::text AS sig, p.proname::text AS name
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.prokind = 'f'
           AND p.prorettype <> 'trigger'::regtype
           AND p.provolatile = 'v'
           AND pg_get_functiondef(p.oid) ~* '\m(insert into|update |delete from)\M'
           AND (
                pg_get_function_identity_arguments(p.oid) ~* '\mp_org_id\M'
             OR pg_get_function_identity_arguments(p.oid) ~* '\mp_actor\M'
             OR pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?operational_authorit'
             OR pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?role_definitions'
               )
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_fn.sig);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', v_fn.sig);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_fn.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn.sig);
        v_n := v_n + 1;
    END LOOP;

    RAISE NOTICE 'org-parameterized RPC execute boundary: closed % functions', v_n;

    -- A loop that matched nothing would leave the estate exactly as it was and
    -- report success. The census measured 14; fewer than that means the predicate
    -- stopped seeing the family it was written for.
    IF v_n < 14 THEN
        RAISE EXCEPTION 'boundary predicate matched only % functions; census measured 14 org/actor-parameterized mutating functions open to clients', v_n;
    END IF;
END;
$close$;

-- ---------------------------------------------------------------------------
-- 3. SELF-TEST: the report agrees, and nothing in the family is still open.
--    A migration that revoked the wrong set would pass step 2 and fail here.
-- ---------------------------------------------------------------------------
DO $selftest$
DECLARE
    v_open   text[];
    v_all    int;
    v_nosvc  text[];
BEGIN
    SELECT coalesce(array_agg(proname ORDER BY proname), ARRAY[]::text[])
      INTO v_open
      FROM public.access_rpc_boundary_report()
     WHERE open_to_clients;

    IF array_length(v_open, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'functions still executable by anon/authenticated/PUBLIC after the boundary: %',
            array_to_string(v_open, ', ');
    END IF;

    -- NOT-VACUOUS FLOOR. 10 is the floor the existing live lock already asserts
    -- for the original families; the widened scan is a superset of those, so it can
    -- never legitimately see fewer. A specific larger number was tempting here and
    -- would have been invented rather than measured.
    SELECT count(*) INTO v_all FROM public.access_rpc_boundary_report();
    IF v_all <= 10 THEN
        RAISE EXCEPTION 'boundary report sees only % functions; it is no longer scanning the families it guards', v_all;
    END IF;

    -- Closing a function to clients while ALSO leaving it unreachable by the
    -- server would break the supported path instead of protecting it.
    SELECT coalesce(array_agg(proname ORDER BY proname), ARRAY[]::text[])
      INTO v_nosvc
      FROM public.access_rpc_boundary_report()
     WHERE NOT has_service_role;

    IF array_length(v_nosvc, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'these guarded functions have no service_role EXECUTE, so the supported server path cannot call them: %',
            array_to_string(v_nosvc, ', ');
    END IF;

    RAISE NOTICE 'boundary self-test: % guarded functions, 0 open to clients, all reachable by service_role', v_all;
END;
$selftest$;
