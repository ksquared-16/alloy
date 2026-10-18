-- Enrollment closeout — membership/access-profile invariant (migration 20261126090000), rollback-only.
-- Run by database.run_rollback_invariant_test against ALLOY_LOCAL_CERTIFICATION: the executor owns the
-- transaction and always discards it. Every case also undoes its own writes (sub-block raises 'undo').
-- Any invariant that does not hold RAISEs, so the run reports ASSERTION_FAILED. Output: NOTICE lines.
CREATE TEMP TABLE t_before AS SELECT
  (SELECT count(*) FROM public.user_roles) AS memberships,
  (SELECT count(*) FROM public.user_access_profiles) AS profiles,
  (SELECT count(*) FROM public.role_permission_grants) AS grants,
  (SELECT count(*) FROM public.user_access_profiles WHERE department_scope = 'restricted' OR site_scope = 'restricted') AS restricted,
  (SELECT md5(string_agg(a.user_id::text || a.org_id::text || a.department_scope || a.site_scope, ',' ORDER BY a.user_id, a.org_id))
     FROM public.user_access_profiles a) AS profile_fp,
  (SELECT md5(string_agg(d.user_id::text || d.department_id::text, ',' ORDER BY d.user_id, d.department_id)) FROM public.user_department_access d) AS dept_fp,
  (SELECT md5(string_agg(s.user_id::text || s.location_id::text, ',' ORDER BY s.user_id, s.location_id)) FROM public.user_site_access s) AS site_fp;

DO $$
DECLARE
  v_org uuid; v_role text; v_user uuid; v_member_user uuid; v_member_org uuid; v_other_org uuid;
  v_msg text; v_ok boolean; b record;
BEGIN
  -- Subjects: an existing auth user with NO membership/profile in an org that defines a role, and an existing
  -- all/all membership for the removal cases. Nothing here is created outside this transaction.
  SELECT rd.org_id, rd.role_key INTO v_org, v_role FROM public.role_definitions rd ORDER BY rd.org_id, rd.role_key LIMIT 1;
  SELECT u.id INTO v_user FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.org_id = v_org)
     AND NOT EXISTS (SELECT 1 FROM public.user_access_profiles a WHERE a.user_id = u.id AND a.org_id = v_org)
   ORDER BY u.id LIMIT 1;
  SELECT r.user_id, r.org_id INTO v_member_user, v_member_org FROM public.user_roles r
    JOIN public.user_access_profiles a ON a.user_id = r.user_id AND a.org_id = r.org_id
   WHERE a.department_scope = 'all' AND a.site_scope = 'all' ORDER BY r.user_id, r.org_id LIMIT 1;
  SELECT o.id INTO v_other_org FROM public.orgs o WHERE o.id <> v_member_org ORDER BY o.id LIMIT 1;
  IF v_org IS NULL OR v_user IS NULL OR v_member_user IS NULL OR v_other_org IS NULL THEN
    RAISE EXCEPTION 'SETUP subjects unavailable (org %, user %, member %, other org %)', v_org, v_user, v_member_user, v_other_org;
  END IF;

  -- 1. A membership written without an access profile is refused at the constraint check.
  v_ok := false;
  BEGIN
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user, v_org, v_role);
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_ok := (v_msg = 'membership_requires_access_profile');
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF NOT v_ok THEN RAISE EXCEPTION 'CASE 1 FAILED: profileless membership was not refused (got %)', v_msg; END IF;
  RAISE NOTICE 'CASE 1 PASS missing profile refused';

  -- 2. Membership and profile written together are accepted — in either order.
  BEGIN
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user, v_org, v_role);
    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope) VALUES (v_user, v_org, 'all', 'all');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF v_msg <> 'undo' THEN RAISE EXCEPTION 'CASE 2a FAILED: role-then-profile refused (%)', v_msg; END IF;
  BEGIN
    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope) VALUES (v_user, v_org, 'all', 'all');
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user, v_org, v_role);
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF v_msg <> 'undo' THEN RAISE EXCEPTION 'CASE 2b FAILED: profile-then-role refused (%)', v_msg; END IF;
  RAISE NOTICE 'CASE 2 PASS atomic creation accepted (both orders)';

  -- 3. Removing the profile while the membership remains is refused; so is moving it to another org.
  v_ok := false;
  BEGIN
    DELETE FROM public.user_access_profiles WHERE user_id = v_member_user AND org_id = v_member_org;
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_ok := (v_msg = 'membership_requires_access_profile');
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF NOT v_ok THEN RAISE EXCEPTION 'CASE 3a FAILED: profile removal under a live membership was not refused (got %)', v_msg; END IF;
  v_ok := false;
  BEGIN
    UPDATE public.user_access_profiles SET org_id = v_other_org WHERE user_id = v_member_user AND org_id = v_member_org;
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_ok := (v_msg = 'membership_requires_access_profile') OR (v_msg LIKE '%violates foreign key%') OR (v_msg LIKE '%duplicate key%');
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF NOT v_ok THEN RAISE EXCEPTION 'CASE 3b FAILED: moving a profile away from its membership was not refused (got %)', v_msg; END IF;
  RAISE NOTICE 'CASE 3 PASS invalid profile removal and move refused';

  -- 4. Removing the membership (then its profile) is accepted and leaves no membership without a profile.
  BEGIN
    DELETE FROM public.user_roles WHERE user_id = v_member_user AND org_id = v_member_org;
    SET CONSTRAINTS ALL IMMEDIATE;
    DELETE FROM public.user_access_profiles WHERE user_id = v_member_user AND org_id = v_member_org;
    SET CONSTRAINTS ALL IMMEDIATE;
    IF EXISTS (SELECT 1 FROM (SELECT DISTINCT user_id, org_id FROM public.user_roles) m
                WHERE NOT EXISTS (SELECT 1 FROM public.user_access_profiles a WHERE a.user_id = m.user_id AND a.org_id = m.org_id)) THEN
      RAISE EXCEPTION 'CASE 4 FAILED: a membership without a profile exists after removal';
    END IF;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF v_msg <> 'undo' THEN RAISE EXCEPTION 'CASE 4 FAILED: membership removal (%)', v_msg; END IF;
  RAISE NOTICE 'CASE 4 PASS membership removal accepted, boundary intact';

  -- 5. No widening: after every case, the state equals the starting state; restricted stays restricted.
  SELECT * INTO b FROM t_before;
  IF (SELECT count(*) FROM public.user_roles) <> b.memberships
     OR (SELECT count(*) FROM public.user_access_profiles) <> b.profiles
     OR (SELECT count(*) FROM public.role_permission_grants) <> b.grants
     OR (SELECT count(*) FROM public.user_access_profiles WHERE department_scope = 'restricted' OR site_scope = 'restricted') <> b.restricted
     OR (SELECT md5(string_agg(a.user_id::text || a.org_id::text || a.department_scope || a.site_scope, ',' ORDER BY a.user_id, a.org_id)) FROM public.user_access_profiles a) IS DISTINCT FROM b.profile_fp
     OR (SELECT md5(string_agg(d.user_id::text || d.department_id::text, ',' ORDER BY d.user_id, d.department_id)) FROM public.user_department_access d) IS DISTINCT FROM b.dept_fp
     OR (SELECT md5(string_agg(s.user_id::text || s.location_id::text, ',' ORDER BY s.user_id, s.location_id)) FROM public.user_site_access s) IS DISTINCT FROM b.site_fp THEN
    RAISE EXCEPTION 'CASE 5 FAILED: access state differs from the starting state';
  END IF;
  RAISE NOTICE 'CASE 5 PASS no widening: memberships %, profiles %, grants %, restricted % unchanged', b.memberships, b.profiles, b.grants, b.restricted;
END $$;
