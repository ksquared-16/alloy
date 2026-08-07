-- =============================================================================
-- W-5 / M2 — Atomic membership + access-profile creation
-- =============================================================================
-- Closes G4 (I-18): `user_roles` inserts referenced no scope table, so every
-- membership the product created was unscoped. With the resolver's current
-- "missing profile => both scopes all" fallback that is fail-open, and it is
-- the count W-0 Q4 measures.
--
-- Membership creation and profile creation MUST be one transaction. Two
-- Supabase inserts from application code are two transactions; these functions
-- are the single-statement boundary that makes the pair atomic.
--
-- Scope of new profiles is BOTH DIMENSIONS 'all', identical to the W-6 backfill
-- and identical to what `resolveAdminAccessCore` infers today when the row is
-- absent. Behaviour is therefore unchanged by construction -- this migration
-- creates a function and has NO data effect (M2: "Function only; no data
-- effect"). Tightening the default is W-7's decision, not this workstream's.
--
-- These are SECURITY INVOKER (the default) on purpose. Every caller already
-- holds service_role via createAdminClient(); SECURITY DEFINER would add an
-- privilege-escalation surface for no benefit.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_membership_with_access_profile
--   Additive: adds one (user_id, org_id, role) membership and guarantees the
--   (user_id, org_id) profile exists. Used by membership-creating paths.
--   Duplicate membership raises 23505 so callers keep their 409 mapping.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_membership_with_access_profile(
    p_user_id uuid,
    p_org_id uuid,
    p_role text
)
RETURNS public.user_roles
LANGUAGE plpgsql
AS $$
DECLARE
    v_row public.user_roles;
BEGIN
    IF p_user_id IS NULL OR p_org_id IS NULL OR p_role IS NULL OR btrim(p_role) = '' THEN
        RAISE EXCEPTION 'create_membership_with_access_profile: p_user_id, p_org_id and p_role are required'
            USING ERRCODE = '22023';
    END IF;

    -- Profile first: the membership row is the thing whose absence is safe.
    -- If this fails the whole call aborts and no membership is left behind.
    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope)
    VALUES (p_user_id, p_org_id, 'all', 'all')
    ON CONFLICT (user_id, org_id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (p_user_id, p_org_id, btrim(p_role))
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.create_membership_with_access_profile(uuid, uuid, text) IS
    'W-5/G4: creates a user_roles membership and its user_access_profiles row in one transaction. New profiles are department_scope=all, site_scope=all (unchanged behaviour vs the resolver fallback). Raises 23505 on duplicate membership.';

-- -----------------------------------------------------------------------------
-- replace_membership_with_access_profile
--   Destructive-by-design: PATCH /api/admin/users/:id/role replaces ALL role
--   rows for the pair with a single role. It previously ran delete-then-insert
--   as two statements, so a failed insert left the user with NO membership at
--   all. Same transaction now: either the replacement lands or nothing moves.
--   Requires an existing membership; callers map 'no membership' to 404.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_membership_with_access_profile(
    p_user_id uuid,
    p_org_id uuid,
    p_role text
)
RETURNS public.user_roles
LANGUAGE plpgsql
AS $$
DECLARE
    v_row public.user_roles;
    v_existing integer;
BEGIN
    IF p_user_id IS NULL OR p_org_id IS NULL OR p_role IS NULL OR btrim(p_role) = '' THEN
        RAISE EXCEPTION 'replace_membership_with_access_profile: p_user_id, p_org_id and p_role are required'
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_existing
    FROM public.user_roles
    WHERE user_id = p_user_id AND org_id = p_org_id;

    IF v_existing = 0 THEN
        RAISE EXCEPTION 'replace_membership_with_access_profile: no membership for (%, %)', p_user_id, p_org_id
            USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope)
    VALUES (p_user_id, p_org_id, 'all', 'all')
    ON CONFLICT (user_id, org_id) DO NOTHING;

    DELETE FROM public.user_roles
    WHERE user_id = p_user_id AND org_id = p_org_id;

    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (p_user_id, p_org_id, btrim(p_role))
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.replace_membership_with_access_profile(uuid, uuid, text) IS
    'W-5/G4: replaces all user_roles rows for (user, org) with a single role and guarantees the access profile exists, in one transaction. Raises P0002 when the pair has no existing membership.';

-- -----------------------------------------------------------------------------
-- Grants. PostgreSQL grants EXECUTE on new functions to PUBLIC by default, so
-- revoking from `anon` alone would be a no-op -- revoke from PUBLIC first.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_membership_with_access_profile(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_membership_with_access_profile(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_membership_with_access_profile(uuid, uuid, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.replace_membership_with_access_profile(uuid, uuid, text) TO postgres;

GRANT EXECUTE ON FUNCTION public.create_membership_with_access_profile(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_membership_with_access_profile(uuid, uuid, text) TO service_role;

-- =============================================================================
-- Verification (run manually; W-5 exit = "Q4's count cannot grow")
-- =============================================================================
-- Q4 anti-join -- must not grow after this lands:
--   SELECT ur.user_id, ur.org_id FROM public.user_roles ur
--   GROUP BY ur.user_id, ur.org_id
--   EXCEPT
--   SELECT p.user_id, p.org_id FROM public.user_access_profiles p;
--
-- No principal other than service_role/postgres may execute:
--   SELECT proname, proacl FROM pg_proc
--   WHERE proname IN ('create_membership_with_access_profile',
--                     'replace_membership_with_access_profile');
-- =============================================================================
