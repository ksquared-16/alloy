-- =============================================================================
-- W7-F002 (Director review, 2026-10-09) — THE NAMED-PERSON RULE IS A USER_ROLES INVARIANT.
--
-- 20261122140000 enforced the rule inside `assert_assignment_delegation_ceiling`, which only the
-- three governed assignment RPCs call, and which returns early for an unattributed call. A direct
-- `user_roles` write (a provisioning script, the dev create-org route, a seed, any future writer)
-- could still make an unlinked user money-capable. The requirement is about a USER acquiring a
-- money-capable capability, so the invariant now lives where users acquire roles: `user_roles`.
--
--   * Inserting, or re-pointing, a `user_roles` row whose role confers a money-capable capability
--     (`money_capable_capability_keys()`, resolved through `role_permission_grants` exactly as
--     `effective_capability_keys` does) is refused for a user with no active link to a named
--     Person — UNLESS nothing new is conferred (the user already holds those keys through other
--     rows), or the governed ceiling already judged this exact (org, user) change in this
--     transaction against the true before-state (its replace path deletes then re-inserts, which a
--     row trigger alone cannot tell from a new grant). Existing holders are never stranded.
--   * The ceiling stays the service-level answer (403 sentence, gained-only semantics) and marks
--     the change it judged with a transaction-local setting.
--   * A ROLE gaining money capability while held by unlinked users stays REFUSED by
--     `trg_enforce_money_capable_role_grant_person_links` (20261122140000): that path changes what
--     existing users can do without a user_roles write, and the explicit decision is to refuse it
--     until every holder is linked, rather than silently confer or strand.
--
-- Also: the helper functions were executable by PUBLIC/authenticated (default privileges), which
-- let any signed-in caller ask whether a user id is linked. Revoked; service_role only.
--
-- Forward-only (20261122140000 is applied and in the ledger). Re-runnable: CREATE OR REPLACE,
-- DROP TRIGGER IF EXISTS on the exact relation, idempotent REVOKE/GRANT.
-- =============================================================================

-- The assignment ceiling, verbatim from 20261122140000 plus the judged marker.
CREATE OR REPLACE FUNCTION public.assert_assignment_delegation_ceiling(
    p_org_id         uuid,
    p_actor_user_id  text,
    p_target_user_id uuid,
    p_next_role_keys text[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_before text[];
    v_after  text[];
    v_gained text[];
    v_actor  text[];
    v_beyond text[];
BEGIN
    -- An unattributed call is not bounded here. Each caller decides whether an
    -- unattributed change is legitimate at all; where it is not, the caller
    -- refuses it with `audit_actor_required` before reaching this function.
    IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
        RETURN;
    END IF;

    v_before := public.effective_capability_keys(p_org_id, p_target_user_id);
    v_after  := public.capability_keys_of_roles(p_org_id, p_next_role_keys);

    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[])
      INTO v_gained
      FROM unnest(v_after) AS k
     WHERE NOT (k = ANY (v_before));

    -- Nothing newly conferred: a lateral move, a reduction, or a no-op. The
    -- actor's own authority is irrelevant to a change that grants nobody
    -- anything, and consulting it would produce false refusals.
    IF array_length(v_gained, 1) IS NULL THEN
        PERFORM set_config('alloy.money_link_judged', p_org_id::text || ':' || p_target_user_id::text, true);
        RETURN;
    END IF;


    v_actor := public.effective_capability_keys(p_org_id, p_actor_user_id::uuid);

    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[])
      INTO v_beyond
      FROM unnest(v_gained) AS k
     WHERE NOT (k = ANY (v_actor));

    IF array_length(v_beyond, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'assignment_ceiling:%', array_to_string(v_beyond, ',')
            USING ERRCODE = '42501';
    END IF;

    -- W7-F002, judged only for a change the actor IS allowed to make: a capability that can move
    -- money is conferred only on a named human. The gained keys are judged, so an existing holder
    -- is never stranded by an unrelated edit.
    IF EXISTS (SELECT 1 FROM unnest(v_gained) AS k WHERE k = ANY (public.money_capable_capability_keys()))
        AND NOT public.user_has_active_person_link(p_org_id, p_target_user_id) THEN
        RAISE EXCEPTION 'money_capable_grant_requires_person_link:%',
            (SELECT array_to_string(array_agg(k ORDER BY k), ',')
               FROM unnest(v_gained) AS k
              WHERE k = ANY (public.money_capable_capability_keys()))
            USING ERRCODE = '42501';
    END IF;

    -- Judged with the TRUE before-state (callers run this before their delete/insert): the
    -- user_roles invariant below accepts this exact change for the rest of the transaction.
    PERFORM set_config('alloy.money_link_judged', p_org_id::text || ':' || p_target_user_id::text, true);
END;
$fn$;


-- ---------------------------------------------------------------------------
-- The invariant at the authority where a user acquires a role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_user_roles_money_capable_person_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_money  text[];
    v_held   text[];
    v_new    text[];
BEGIN
    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_money
      FROM unnest(public.capability_keys_of_roles(NEW.org_id, ARRAY[NEW.role])) AS k
     WHERE k = ANY (public.money_capable_capability_keys());
    IF array_length(v_money, 1) IS NULL THEN
        RETURN NEW;                                   -- the role moves no money
    END IF;
    IF public.user_has_active_person_link(NEW.org_id, NEW.user_id) THEN
        RETURN NEW;                                   -- a named human
    END IF;
    IF current_setting('alloy.money_link_judged', true) = NEW.org_id::text || ':' || NEW.user_id::text THEN
        RETURN NEW;                                   -- the governed ceiling judged this change
    END IF;

    -- Nothing newly conferred: every money key of this role is already held through the user's
    -- OTHER rows (on UPDATE, the row being changed does not count).
    SELECT COALESCE(array_agg(DISTINCT g.permission_key), ARRAY[]::text[]) INTO v_held
      FROM public.user_roles ur
      JOIN public.role_permission_grants g
        ON g.org_id = ur.org_id AND g.role_key = ur.role AND g.allowed
     WHERE ur.org_id = NEW.org_id
       AND ur.user_id = NEW.user_id
       AND ur.role <> NEW.role
       AND NOT (TG_OP = 'UPDATE' AND ur.role = OLD.role AND ur.user_id = OLD.user_id AND ur.org_id = OLD.org_id);
    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_new
      FROM unnest(v_money) AS k
     WHERE NOT (k = ANY (v_held));
    IF array_length(v_new, 1) IS NULL THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'money_capable_grant_requires_person_link:%', array_to_string(v_new, ',')
        USING ERRCODE = '42501';
END;
$fn$;

COMMENT ON FUNCTION public.enforce_user_roles_money_capable_person_link() IS
'W7-F002: a user_roles row that newly confers a money-capable capability requires the user to be linked to a named Person, unless the governed ceiling judged the change (transaction-local alloy.money_link_judged).';

DROP TRIGGER IF EXISTS trg_enforce_user_roles_money_capable_person_link ON public.user_roles;
CREATE TRIGGER trg_enforce_user_roles_money_capable_person_link
    BEFORE INSERT OR UPDATE OF role, user_id, org_id ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_user_roles_money_capable_person_link();

-- ---------------------------------------------------------------------------
-- Helpers: service_role only. Trigger functions fire regardless of EXECUTE.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.user_has_active_person_link(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.money_capable_capability_keys() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_money_capable_role_grant_person_links() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_user_roles_money_capable_person_link() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_active_person_link(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.money_capable_capability_keys() TO service_role;
