-- AN INVITATION WITH A LOCATION RESTRICTION IS ONE WRITE, NOT TWO.
--
-- Access/RBAC (Director authorization: fallback-to-deny and the invite-form correction). The invite
-- form created the membership through create_membership_with_access_profile — which always writes an
-- all/all profile — and THEN narrowed it with a second request to the access-scope route. If that
-- second request failed (or the inviter lacked the scope-write capability), an operator who chose
-- "Selected locations" left behind an account with organization-wide access.
--
-- create_membership_with_access_scope composes the two existing canonical owners in ONE transaction:
--   1. create_membership_with_access_profile — the delegation ceiling, profile first, then the role;
--   2. replace_member_access_scope_audited    — the restricted site list, with its D2 scope audit,
--      only when the invitation restricts sites.
-- Either both happen or neither does. Nothing they do is re-implemented here; this function only
-- validates what it hands the second one (a restricted scope needs a non-empty list of this org's
-- locations) and refuses anything else. Departments are not set at invite (OD-8), so they stay all.
--
-- Security: SECURITY DEFINER with a pinned search_path, EXECUTE for service_role only — the same
-- grant the two composed functions carry. Idempotent (CREATE OR REPLACE; REVOKE/GRANT). No table,
-- column, constraint or existing row is changed.

CREATE OR REPLACE FUNCTION public.create_membership_with_access_scope(
    p_user_id           uuid,
    p_org_id            uuid,
    p_role              text,
    p_actor_user_id     text,
    p_site_scope        text,
    p_site_location_ids uuid[],
    p_origin            text DEFAULT 'operator',
    p_correlation_id    text DEFAULT NULL
) RETURNS public.user_roles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_row public.user_roles;
    v_ids uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_site_location_ids, ARRAY[]::uuid[])) AS x WHERE x IS NOT NULL);
BEGIN
    IF p_site_scope IS NULL OR p_site_scope NOT IN ('all', 'restricted') THEN
        RAISE EXCEPTION 'invite_site_scope_invalid: site scope must be all or restricted' USING ERRCODE = '22023';
    END IF;
    IF p_site_scope = 'restricted' THEN
        IF cardinality(v_ids) = 0 THEN
            RAISE EXCEPTION 'invite_site_scope_empty: a restricted invitation needs at least one location' USING ERRCODE = '23514';
        END IF;
        IF EXISTS (SELECT 1 FROM unnest(v_ids) AS l(id)
                    WHERE NOT EXISTS (SELECT 1 FROM public.locations loc WHERE loc.id = l.id AND loc.org_id = p_org_id AND loc.location_type = 'site')) THEN
            RAISE EXCEPTION 'invite_site_not_in_org: every location must be a site of this organization' USING ERRCODE = '23514';
        END IF;
    END IF;

    v_row := public.create_membership_with_access_profile(p_user_id, p_org_id, p_role, p_actor_user_id);

    IF p_site_scope = 'restricted' THEN
        PERFORM public.replace_member_access_scope_audited(
            p_org_id, p_user_id,
            'all', ARRAY[]::uuid[],
            'restricted', v_ids,
            p_actor_user_id, COALESCE(p_origin, 'operator'), p_correlation_id, NULL);
    END IF;

    RETURN v_row;
END;
$fn$;

COMMENT ON FUNCTION public.create_membership_with_access_scope(uuid, uuid, text, text, text, uuid[], text, text) IS
    'Access/RBAC: create a membership (delegation ceiling, profile first) and, when restricted, its site scope (audited) in one transaction. Service role only.';

REVOKE ALL ON FUNCTION public.create_membership_with_access_scope(uuid, uuid, text, text, text, uuid[], text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_membership_with_access_scope(uuid, uuid, text, text, text, uuid[], text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_membership_with_access_scope(uuid, uuid, text, text, text, uuid[], text, text) TO service_role;
