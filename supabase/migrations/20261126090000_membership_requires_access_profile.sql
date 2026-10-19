-- EVERY MEMBERSHIP HAS AN ACCESS PROFILE — backfilled once, then held by the database.
--
-- Access/RBAC (Director authorization: admin access fallback closure). A (user, org) membership in
-- user_roles with no user_access_profiles row is resolved by the "legacy-all" fallback
-- (web/lib/admin/resolveAdminAccessCore.ts): department and site scope ALL inside that org. M1
-- (20260807140000) backfilled every such pair, but the pool refilled: deployed census 2026-10-18 found
-- 7 demo-childcare admin memberships created after M1, all by QA/seed tooling that wrote the role
-- without the profile (product writers already use the atomic membership RPCs).
--
--   1. BACKFILL exactly the profileless pairs as all/all — exactly what the fallback grants them today,
--      so nobody's access widens or narrows. Self-sized: aborts unless every profileless pair, and
--      nothing else, gained a profile, and no existing profile changed.
--   2. INVARIANT: a deferred constraint trigger refuses, at COMMIT, a membership without a profile and
--      a profile removed (or moved) while its membership remains. Atomic writers (profile and role in
--      one transaction, in either order) and cascading deletes pass; a role written alone fails with
--      membership_requires_access_profile.
--
-- With both in place the fallback no longer has anyone to apply to; the code switches it to deny only
-- after a census confirms zero profileless memberships. Idempotent: re-running backfills nothing and
-- re-creates the triggers.

DO $$
DECLARE
    v_before int;
    v_created int;
    v_after int;
    v_profiles_before int;
    v_profiles_after int;
    v_changed int;
BEGIN
    SELECT count(*) INTO v_before
      FROM (SELECT DISTINCT user_id, org_id FROM public.user_roles) m
     WHERE NOT EXISTS (SELECT 1 FROM public.user_access_profiles p WHERE p.user_id = m.user_id AND p.org_id = m.org_id);
    SELECT count(*) INTO v_profiles_before FROM public.user_access_profiles;

    CREATE TEMP TABLE _profiles_before ON COMMIT DROP AS
        SELECT id, department_scope, site_scope, updated_at FROM public.user_access_profiles;

    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope)
    SELECT DISTINCT ur.user_id, ur.org_id, 'all', 'all'
      FROM public.user_roles ur
     WHERE NOT EXISTS (SELECT 1 FROM public.user_access_profiles p WHERE p.user_id = ur.user_id AND p.org_id = ur.org_id)
    ON CONFLICT (user_id, org_id) DO NOTHING;
    GET DIAGNOSTICS v_created = ROW_COUNT;

    SELECT count(*) INTO v_after
      FROM (SELECT DISTINCT user_id, org_id FROM public.user_roles) m
     WHERE NOT EXISTS (SELECT 1 FROM public.user_access_profiles p WHERE p.user_id = m.user_id AND p.org_id = m.org_id);
    SELECT count(*) INTO v_profiles_after FROM public.user_access_profiles;
    SELECT count(*) INTO v_changed
      FROM _profiles_before b JOIN public.user_access_profiles p ON p.id = b.id
     WHERE p.department_scope IS DISTINCT FROM b.department_scope
        OR p.site_scope IS DISTINCT FROM b.site_scope
        OR p.updated_at IS DISTINCT FROM b.updated_at;

    IF v_created <> v_before OR v_after <> 0 OR v_profiles_after <> v_profiles_before + v_created OR v_changed <> 0 THEN
        RAISE EXCEPTION 'membership profile backfill aborted: profileless_before=% created=% profileless_after=% profiles % -> % changed_existing=%',
            v_before, v_created, v_after, v_profiles_before, v_profiles_after, v_changed;
    END IF;
    RAISE NOTICE 'membership profile backfill: profileless_before=% created=% profileless_after=0', v_before, v_created;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_membership_has_access_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_user uuid;
    v_org uuid;
BEGIN
    IF TG_TABLE_NAME = 'user_roles' THEN
        v_user := NEW.user_id;
        v_org := NEW.org_id;
    ELSE
        v_user := OLD.user_id;
        v_org := OLD.org_id;
    END IF;
    -- No membership left (removal, cascade): nothing to hold.
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user AND org_id = v_org) THEN
        RETURN NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_access_profiles WHERE user_id = v_user AND org_id = v_org) THEN
        RETURN NULL;
    END IF;
    RAISE EXCEPTION 'membership_requires_access_profile' USING ERRCODE = '23514',
        DETAIL = format('org=%s user=%s', v_org, v_user);
END;
$fn$;

COMMENT ON FUNCTION public.enforce_membership_has_access_profile() IS
    'Access/RBAC invariant: every user_roles membership has a user_access_profiles row at commit.';

REVOKE ALL ON FUNCTION public.enforce_membership_has_access_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_membership_has_access_profile() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_user_roles_requires_access_profile ON public.user_roles;
CREATE CONSTRAINT TRIGGER trg_user_roles_requires_access_profile
    AFTER INSERT OR UPDATE OF user_id, org_id ON public.user_roles
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.enforce_membership_has_access_profile();

DROP TRIGGER IF EXISTS trg_user_access_profiles_keeps_membership ON public.user_access_profiles;
CREATE CONSTRAINT TRIGGER trg_user_access_profiles_keeps_membership
    AFTER DELETE OR UPDATE OF user_id, org_id ON public.user_access_profiles
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.enforce_membership_has_access_profile();
