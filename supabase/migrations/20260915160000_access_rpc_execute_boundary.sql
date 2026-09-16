-- ===========================================================================
-- THE CEILINGS WERE ENFORCED IN FUNCTIONS ANYONE COULD CALL.
--
-- W-18 bounds the grant editor and the assignment ceiling bounds membership,
-- and both read `p_actor_user_id` -- a parameter the CALLER supplies. That is
-- sound while the only callers are server routes that derive the actor from the
-- authenticated session. It was not the only caller.
--
-- MEASURED, on this database, before this migration:
--
--   A user holding exactly ONE capability -- `portal.access`, the weakest
--   portal-admitted principal there is -- signed in, took the browser's own
--   anon key and their own JWT, POSTed to
--   /rest/v1/rpc/assign_member_role_audited naming the SEEDED ADMINISTRATOR as
--   `p_actor_user_id`, and was granted: the `admin` role landed on another
--   member and the call returned `changed: true`.
--
-- Every authority control in this program is downstream of that. The capability
-- gate lives in the route, so calling the function directly skips it entirely;
-- the ceiling trusts an actor the attacker names; `isSelfAuthorityMutation`
-- never runs; and D2 records the change against whoever the caller chose to
-- blame. W-13 admission, the Access Administration Split, both delegation
-- ceilings and the audit trail all rest on a boundary that was never closed.
--
-- WHY IT WAS OPEN. Nobody granted this. PostgreSQL grants EXECUTE on new
-- functions to PUBLIC by default and Supabase exposes `public` through PostgREST
-- to `authenticated`, so a SECURITY DEFINER function is reachable the moment it
-- exists unless someone says otherwise. Eighteen functions that take a
-- caller-supplied actor were reachable that way.
--
-- THE FIX IS THE BOUNDARY, NOT ANOTHER CHECK INSIDE IT. Re-deriving the actor
-- from `auth.uid()` inside each function would be a second authority model to
-- keep in step with the first, and it would still leave every other
-- actor-taking function exposed. These functions have exactly one legitimate
-- caller class -- server routes holding the service role -- so that is what the
-- grant says.
-- ===========================================================================

DO $revoke$
DECLARE
    v_fn      record;
    v_count   integer := 0;
BEGIN
    FOR v_fn IN
        SELECT p.oid::regprocedure::text AS sig
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_actor_user_id%'
    LOOP
        -- PUBLIC first: revoking only `authenticated` leaves the implicit grant
        -- every role inherits, which is the one that was actually doing the work.
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_fn.sig);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', v_fn.sig);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_fn.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn.sig);
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'ACCESS RPC BOUNDARY ABORT: no actor-taking function was found. The scan has drifted and this migration would be a no-op that looks like a fix.';
    END IF;
    RAISE NOTICE 'access rpc boundary: % actor-taking functions closed to authenticated/anon/PUBLIC', v_count;
END;
$revoke$;

-- ---------------------------------------------------------------------------
-- SELF-TEST: the exploit, and the proof it no longer works.
-- ---------------------------------------------------------------------------
DO $selftest$
DECLARE
    v_open text[];
BEGIN
    SELECT COALESCE(array_agg(p.proname ORDER BY p.proname), ARRAY[]::text[])
      INTO v_open
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_actor_user_id%'
       AND (
            p.proacl IS NULL                                            -- default = PUBLIC EXECUTE
         OR array_to_string(p.proacl::text[], ',') ILIKE '%authenticated=X%'
         OR array_to_string(p.proacl::text[], ',') ILIKE '%anon=X%'
         OR array_to_string(p.proacl::text[], ',') ILIKE '%,=X%'        -- a bare PUBLIC entry
         OR array_to_string(p.proacl::text[], ',') ILIKE '{=X%'
       );

    IF array_length(v_open, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'ACCESS RPC BOUNDARY ABORT: % is still callable by an ordinary authenticated client. The delegation ceilings are only as strong as who may call the function that enforces them.',
            array_to_string(v_open, ', ');
    END IF;

    -- Non-vacuity: the service role must still be able to do the work, or every
    -- Access route breaks the moment this lands.
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='assign_member_role_audited'
           AND array_to_string(p.proacl::text[], ',') ILIKE '%service_role=X%'
    ) THEN
        RAISE EXCEPTION 'ACCESS RPC BOUNDARY ABORT: service_role lost EXECUTE; the product cannot administer access at all.';
    END IF;

    RAISE NOTICE 'access rpc boundary self-test passed: no actor-taking function is reachable by an ordinary client';
END;
$selftest$;

-- ---------------------------------------------------------------------------
-- THE SEAM THE LOCK READS.
--
-- The repo lock has to answer "who may call these?" from outside the database,
-- and PostgREST cannot reach `pg_catalog`. One read-only reporter gives it the
-- three facts it needs — which functions take a caller-supplied actor, which of
-- those an ordinary client may execute, and which have lost the service role —
-- without the test re-deriving the rule and drifting from this migration.
--
-- It takes no actor, mutates nothing, and is itself closed to ordinary clients:
-- the shape of the authority boundary is not something a tenant needs to read.
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
       AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_actor_user_id%';
$fn$;

REVOKE EXECUTE ON FUNCTION public.access_rpc_boundary_report() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.access_rpc_boundary_report() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.access_rpc_boundary_report() FROM anon;
GRANT  EXECUTE ON FUNCTION public.access_rpc_boundary_report() TO service_role;
