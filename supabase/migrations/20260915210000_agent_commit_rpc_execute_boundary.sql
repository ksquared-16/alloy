-- ===========================================================================
-- THE AGENT COMMIT RPCs WERE OPEN TO EVERY SIGNED-IN BROWSER SESSION.
--
-- `20260915160000` closed this defect class for the Access RPCs. Its sweep
-- selected functions taking `p_actor_user_id`, and later the writers of
-- `role_permission_grants` / `user_roles`. The three agent commit functions
-- take `p_user_id` rather than `p_actor_user_id` and write neither table, so
-- they fell outside every pass and kept the shape the Access sweep removed:
--
--   agent_v0_commit_queue_definition_apply(p_org_id, p_user_id, ...)
--   agent_v1_commit_record_overview_layout_apply(p_org_id, p_user_id, ...)
--   agent_v2_commit_field_visibility_apply(p_org_id, p_user_id, ...)
--
-- All three are SECURITY DEFINER, were EXECUTE-able by `authenticated`, take a
-- CALLER-SUPPLIED organization and a CALLER-SUPPLIED actor, and contain no
-- authorization check of any kind -- no capability, no membership test, no
-- comparison of `p_org_id` to anything the caller actually belongs to.
--
-- MEASURED, NOT INFERRED. Executed as the bare `authenticated` role, holding no
-- capability whatsoever, against a real field definition:
--
--   * the call succeeded;
--   * `field_definitions.is_visible_in_form` flipped false -> true;
--   * the apply-audit row recorded a FORGED actor id the caller chose.
--
-- (Run inside a transaction and rolled back; no state was changed.)
--
-- So the route gate on each of these -- `ctx.role !== 'admin'` -- was decorative.
-- Any authenticated principal of ANY organization could pass another
-- organization's id and rewrite its configuration, then attribute the change to
-- somebody else. That is a cross-tenant write and an audit forgery in one call.
--
-- THE REPAIR IS THE PROMOTED ONE. Client roles lose EXECUTE; `service_role`
-- keeps it, so the Next.js routes -- which already resolve the caller, derive
-- the organization server-side and apply their own authority check -- continue
-- to work unchanged. Nothing about the product's behaviour changes for a
-- legitimate operator.
--
-- PATTERN-SCOPED RATHER THAN NAMED, deliberately: the loop covers every current
-- and future `agent_v%_commit_%` function, so a v3 added next quarter is closed
-- on the day it is created rather than on the day somebody remembers.
-- ===========================================================================

DO $boundary$
DECLARE
    fn record;
    v_closed integer := 0;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig, p.proname
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.prokind = 'f'
           AND p.proname LIKE 'agent\_v%\_commit\_%'
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
        v_closed := v_closed + 1;
    END LOOP;

    IF v_closed = 0 THEN
        RAISE EXCEPTION 'AGENTRPC ABORT: the sweep matched no agent commit function. Either the naming changed or this migration is now a no-op pretending to be a boundary.';
    END IF;
    RAISE NOTICE 'agent commit RPC boundary: % function(s) closed to client roles', v_closed;
END
$boundary$;

-- ---------------------------------------------------------------------------
-- THE REPORT, so a lock can read the boundary rather than trust this migration.
--
-- Deliberately separate from `access_rpc_boundary_report()`: that one answers a
-- question about Access mutation RPCs, and widening it to mean "every privileged
-- function anywhere" would make a passing report say less than it does now.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_rpc_boundary_report()
RETURNS TABLE (proname text, open_to_clients boolean, has_service_role boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
    SELECT p.proname::text,
           (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR has_function_privilege('anon', p.oid, 'EXECUTE')) AS open_to_clients,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS has_service_role
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.proname LIKE 'agent\_v%\_commit\_%'
     ORDER BY p.proname;
$fn$;

REVOKE ALL ON FUNCTION public.agent_rpc_boundary_report() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_rpc_boundary_report() FROM anon;
REVOKE ALL ON FUNCTION public.agent_rpc_boundary_report() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rpc_boundary_report() TO service_role;

-- ---------------------------------------------------------------------------
-- SELF-TEST: the boundary holds, and the report is not vacuous.
-- ---------------------------------------------------------------------------
DO $selftest$
DECLARE
    v_total integer;
    v_open  integer;
    v_svc   integer;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE open_to_clients), count(*) FILTER (WHERE has_service_role)
      INTO v_total, v_open, v_svc
      FROM public.agent_rpc_boundary_report();

    IF v_total = 0 THEN
        RAISE EXCEPTION 'AGENTRPC ABORT: the report covers nothing; a green boundary over an empty set is not a boundary.';
    END IF;
    IF v_open <> 0 THEN
        RAISE EXCEPTION 'AGENTRPC ABORT: % agent commit function(s) remain executable by a client role.', v_open;
    END IF;
    IF v_svc <> v_total THEN
        RAISE EXCEPTION 'AGENTRPC ABORT: % of % agent commit functions lost service_role EXECUTE; the routes would break.', v_total - v_svc, v_total;
    END IF;

    RAISE NOTICE 'agent commit RPC boundary self-test passed: % functions, 0 open to clients, all service_role', v_total;
END
$selftest$;
