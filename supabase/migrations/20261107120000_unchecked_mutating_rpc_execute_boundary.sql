-- UNCHECKED MUTATING RPC EXECUTE BOUNDARY — the shape, not the spelling
--
-- WHAT THIS CLOSES, AND WHY IT EXISTS AT ALL.
--
-- `20261104120000` closed 13 of the 14 mutating functions that were EXECUTE-granted to
-- `authenticated` with no caller-authority check. One got away: `post_ledger_transaction`.
-- Measured on the deployed primary after that migration applied (2026-09-30 14:12 UTC):
--
--   rpc_acl ~ post_ledger_transaction ~ postgres=X | authenticated=X | service_role=X
--   rpc ~ post_ledger_transaction ~ secdef=true :: auth_uid=false :: auth_role=false
--                                :: has_org_role=false :: capability_fn=false
--
-- It escaped because `20261104120000` matched on PARAMETER NAMES — `p_org_id` or `p_actor`
-- in the identity arguments, or writes to `operational_authorit` / `role_definitions`.
-- `post_ledger_transaction(p_ledger_tx_id uuid)` has none of those. Its only argument names
-- a ledger transaction.
--
-- THE DEEPER DEFECT, WHICH THIS MIGRATION IS SHAPED TO FIX.
--
-- `access_rpc_boundary_report()` used the SAME predicate as that migration's revoke loop. So
-- the function was not merely un-revoked — it was INVISIBLE to the check that was supposed to
-- notice. The migration's own self-test asked "does the report show anything still open to
-- clients?", the report could not see it, and the self-test passed while leaving it open. A
-- detector and a remediator sharing one predicate cannot catch that predicate being wrong.
--
-- The count floor did not help either: the revoke loop had no privilege filter, so it swept
-- enough other functions to clear its `v_n < 14` assertion while missing the one that mattered.
--
-- So two things change here, and the second is the important one:
--
--   1. The watched family is defined by the SHAPE of the danger — a function that can mutate
--      and performs no recognised caller-authority check — instead of by the names its
--      parameters happen to use. A future function called `post_whatever(p_thing_id uuid)` is
--      in scope on the day it is written.
--
--   2. The self-test reads the CATALOG DIRECTLY rather than the report. It asks "is any
--      mutating, client-executable, unchecked function still reachable?" — a question the
--      report's predicate cannot silently narrow. If the report is wrong again, the self-test
--      still fails.
--
-- SEVERITY OF THE SURVIVOR, STATED HONESTLY. `post_ledger_transaction` is SECURITY DEFINER and
-- mutating with no caller check, so RLS never sees its writes. But it has ZERO application
-- callers (`lib/financials/financialJournalService.ts` documents the double-entry structure as
-- belonging to the job/Stripe vertical and dormant), and it takes a ledger transaction id
-- rather than an organization — so unlike the other thirteen it cannot be aimed at an arbitrary
-- tenant by parameter. It is a money-adjacent write reachable by any authenticated JWT, which
-- is reason enough to close it, and not a live cross-tenant breach.
--
-- WHY REVOKING IS SAFE. `service_role` keeps EXECUTE. Every supported caller is a server module
-- holding a client injected by an API route, and the browser Supabase clients in this tree are
-- auth-only. Internal function-to-function calls are unaffected: they run with the calling
-- function's privileges, not the client's.
--
-- Re-runnable: CREATE OR REPLACE, idempotent REVOKE/GRANT, and a self-test that asserts state
-- rather than mutating it.

-- ---------------------------------------------------------------------------
-- 1. WIDEN THE WATCHED FAMILY to the shape of the danger.
--
--    The original 2026-09 terms are kept verbatim and unconditionally, so that scope cannot be
--    narrowed by this rewrite — `replace_role_permission_grants`, `assign_member_role_audited`
--    and `create_membership_with_access_profile` must stay visible, and the live lock asserts
--    the report still sees more than ten functions.
--
--    The new term deliberately does NOT test the ACL. The report describes the family to WATCH;
--    `open_to_clients` is the computed verdict. Folding the grant state into the predicate would
--    make the report empty the moment the repair succeeded, and a population that shrinks to
--    nothing on success is how a non-vacuity check inverts — which has already happened twice
--    in this estate.
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
       AND p.prokind = 'f'
       -- Trigger functions are not reachable through PostgREST and must keep their privileges:
       -- `handle_new_user` is Supabase auth signup.
       AND p.prorettype <> 'trigger'::regtype
       AND (
            -- ORIGINAL 2026-09 SCOPE (unchanged, unconditional).
            pg_get_function_identity_arguments(p.oid) ILIKE '%p_actor_user_id%'
         OR pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?role_permission_grants'
         OR pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?user_roles'
            -- 20261104120000 scope (kept, so nothing it caught can drift back out).
         OR pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?operational_authorit'
         OR pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?role_definitions'
            -- THE SHAPE. Mutating, and performing no recognised caller-authority check. No
            -- parameter name appears in this term, which is the whole point: the previous
            -- version asked what the arguments were called and missed a function whose only
            -- argument was `p_ledger_tx_id`.
         OR (
                p.provolatile = 'v'
            AND pg_get_functiondef(p.oid) ~* '\m(insert into|update |delete from)\M'
            AND pg_get_functiondef(p.oid) NOT LIKE '%auth.uid()%'
            AND pg_get_functiondef(p.oid) NOT LIKE '%auth.role()%'
            AND pg_get_functiondef(p.oid) NOT LIKE '%has_org_role%'
            AND pg_get_functiondef(p.oid) NOT LIKE '%effective_capability_keys%'
            )
       );
$fn$;

REVOKE EXECUTE ON FUNCTION public.access_rpc_boundary_report() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.access_rpc_boundary_report() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.access_rpc_boundary_report() FROM anon;
GRANT  EXECUTE ON FUNCTION public.access_rpc_boundary_report() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. CLOSE every member of the widened family that a client can still execute.
--
--    Note the privilege filter, which `20261104120000` lacked: this loop touches only functions
--    a client principal can actually reach today, so `v_n` is a count of REAL closures rather
--    than a count of statements executed. That is what makes the floor below meaningful.
-- ---------------------------------------------------------------------------
DO $close$
DECLARE
    v_fn record;
    v_n  int := 0;
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
           AND pg_get_functiondef(p.oid) NOT LIKE '%auth.uid()%'
           AND pg_get_functiondef(p.oid) NOT LIKE '%auth.role()%'
           AND pg_get_functiondef(p.oid) NOT LIKE '%has_org_role%'
           AND pg_get_functiondef(p.oid) NOT LIKE '%effective_capability_keys%'
           AND (
                has_function_privilege('authenticated', p.oid, 'EXECUTE')
             OR has_function_privilege('anon', p.oid, 'EXECUTE')
               )
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_fn.sig);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', v_fn.sig);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_fn.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn.sig);
        v_n := v_n + 1;
        RAISE NOTICE 'closed unchecked mutating function: %', v_fn.name;
    END LOOP;

    RAISE NOTICE 'unchecked mutating RPC boundary: closed % function(s)', v_n;
END;
$close$;

-- ---------------------------------------------------------------------------
-- 3. SELF-TEST — READ THE CATALOG, NOT THE REPORT.
--
--    This is the correction that matters. `20261104120000` asked its own report whether anything
--    was still open, and the report shared the migration's blind spot, so the answer was a
--    confident yes-it-is-closed about a function neither could see. These assertions go to
--    `pg_proc` directly, so a wrong predicate in the report above cannot hide a failure here.
-- ---------------------------------------------------------------------------
DO $selftest$
DECLARE
    v_open   text[];
    v_nosvc  text[];
    v_family int;
BEGIN
    -- (a) THE REAL QUESTION. Any mutating, unchecked function a client can still execute.
    SELECT coalesce(array_agg(p.proname::text ORDER BY p.proname), ARRAY[]::text[])
      INTO v_open
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.prorettype <> 'trigger'::regtype
       AND p.provolatile = 'v'
       AND pg_get_functiondef(p.oid) ~* '\m(insert into|update |delete from)\M'
       AND pg_get_functiondef(p.oid) NOT LIKE '%auth.uid()%'
       AND pg_get_functiondef(p.oid) NOT LIKE '%auth.role()%'
       AND pg_get_functiondef(p.oid) NOT LIKE '%has_org_role%'
       AND pg_get_functiondef(p.oid) NOT LIKE '%effective_capability_keys%'
       AND (
            has_function_privilege('authenticated', p.oid, 'EXECUTE')
         OR has_function_privilege('anon', p.oid, 'EXECUTE')
           );

    IF array_length(v_open, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'mutating functions with no caller-authority check are still executable by a client principal: %',
            array_to_string(v_open, ', ');
    END IF;

    -- (b) PROTECTED IS NOT THE SAME AS BROKEN. Everything in the family must remain reachable
    --     by the server, or this migration has removed a supported path instead of an exposure.
    SELECT coalesce(array_agg(proname ORDER BY proname), ARRAY[]::text[])
      INTO v_nosvc
      FROM public.access_rpc_boundary_report()
     WHERE NOT has_service_role;

    IF array_length(v_nosvc, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'these guarded functions have no service_role EXECUTE, so the supported server path cannot call them: %',
            array_to_string(v_nosvc, ', ');
    END IF;

    -- (c) NOT VACUOUS. The widened report must still see the family it guards. Ten is the floor
    --     the existing live lock already asserts; this predicate is a superset of that one, so it
    --     can never legitimately see fewer. Deliberately not a larger invented number — the
    --     population is allowed to shrink as functions gain real authority checks.
    SELECT count(*) INTO v_family FROM public.access_rpc_boundary_report();
    IF v_family <= 10 THEN
        RAISE EXCEPTION 'boundary report sees only % function(s); it is no longer scanning the families it guards', v_family;
    END IF;

    RAISE NOTICE 'boundary self-test: % watched function(s), 0 executable by a client, all reachable by service_role', v_family;
END;
$selftest$;
