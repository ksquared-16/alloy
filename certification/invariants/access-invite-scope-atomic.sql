-- Access — an invitation limited to selected sites is ONE write (migration 20261127090000), rollback-only.
-- Run by database.run_rollback_invariant_test against an isolated ALLOY_LOCAL_CERTIFICATION environment: the
-- executor owns the transaction and always discards it; every case also undoes its own writes ('undo').
-- Any invariant that does not hold RAISEs (ASSERTION_FAILED). Output: NOTICE lines.
CREATE TEMP TABLE t_before AS SELECT
  (SELECT count(*) FROM public.user_roles) AS memberships,
  (SELECT count(*) FROM public.user_access_profiles) AS profiles,
  (SELECT count(*) FROM public.user_site_access) AS site_rows,
  (SELECT count(*) FROM public.user_department_access) AS dept_rows,
  (SELECT count(*) FROM public.role_permission_grants) AS grants,
  (SELECT count(*) FROM public.mutation_events) AS events,
  (SELECT count(*) FROM public.user_access_profiles WHERE department_scope = 'restricted' OR site_scope = 'restricted') AS restricted;

DO $$
DECLARE
  c_subject constant uuid := 'c105e0a1-0000-4000-8000-00000000c11e';
  v_org uuid; v_role text; v_actor text; v_site uuid; v_foreign uuid;
  v_msg text; v_ok boolean; b record; v_p record;
BEGIN
  -- Subjects: a disposable auth user (created here, discarded with the transaction), an org with a site,
  -- a role carrying NO money-capable grant, an actor who already holds that role's authority (an admin of
  -- the org — the delegation ceiling is the membership owner's, unchanged), and a location that is NOT a
  -- site of that org.
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = c_subject) THEN RAISE EXCEPTION 'SETUP disposable subject exists'; END IF;
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at)
  VALUES (c_subject, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'invite-scope-invariant-subject@example.invalid', '{}'::jsonb, '{}'::jsonb, '', '', '', '', now(), now());
  SELECT l.org_id, l.id INTO v_org, v_site FROM public.locations l WHERE l.location_type = 'site' ORDER BY l.org_id, l.id LIMIT 1;
  SELECT rd.role_key INTO v_role FROM public.role_definitions rd
   WHERE rd.org_id = v_org AND rd.is_active
     AND NOT EXISTS (SELECT 1 FROM public.role_permission_grants g WHERE g.org_id = rd.org_id AND g.role_key = rd.role_key AND g.allowed
                       AND g.permission_key = ANY (public.money_capable_capability_keys()))
   ORDER BY rd.role_key LIMIT 1;
  SELECT r.user_id::text INTO v_actor FROM public.user_roles r WHERE r.org_id = v_org AND lower(btrim(r.role)) = 'admin' ORDER BY r.user_id LIMIT 1;
  SELECT l.id INTO v_foreign FROM public.locations l WHERE NOT (l.org_id = v_org AND l.location_type = 'site') ORDER BY l.id LIMIT 1;
  IF v_org IS NULL OR v_site IS NULL OR v_role IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'SETUP subjects unavailable (org %, site %, non-money role %, admin actor %)', v_org, v_site, v_role, v_actor;
  END IF;

  -- 1. A restricted invitation writes membership, profile (departments all, sites restricted), the site row
  --    and the scope audit — together.
  BEGIN
    PERFORM public.create_membership_with_access_scope(c_subject, v_org, v_role, v_actor, 'restricted', ARRAY[v_site], 'operator', NULL);
    SET CONSTRAINTS ALL IMMEDIATE;
    SELECT * INTO v_p FROM public.user_access_profiles WHERE user_id = c_subject AND org_id = v_org;
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = c_subject AND org_id = v_org AND role = v_role) THEN RAISE EXCEPTION 'CASE 1 FAILED: no membership'; END IF;
    IF v_p IS NULL OR v_p.department_scope <> 'all' OR v_p.site_scope <> 'restricted' THEN RAISE EXCEPTION 'CASE 1 FAILED: profile is %/%', v_p.department_scope, v_p.site_scope; END IF;
    IF (SELECT array_agg(location_id) FROM public.user_site_access WHERE user_id = c_subject AND org_id = v_org) IS DISTINCT FROM ARRAY[v_site] THEN RAISE EXCEPTION 'CASE 1 FAILED: site rows wrong'; END IF;
    IF (SELECT count(*) FROM public.mutation_events) <= (SELECT events FROM t_before) THEN RAISE EXCEPTION 'CASE 1 FAILED: no scope audit event'; END IF;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF v_msg <> 'undo' THEN RAISE EXCEPTION 'CASE 1 FAILED: %', v_msg; END IF;
  RAISE NOTICE 'CASE 1 PASS restricted invitation written atomically (membership, all/restricted profile, site row, audit)';

  -- 2. A site of another org (or a non-site location) is refused and NOTHING is written.
  IF v_foreign IS NOT NULL THEN
    v_ok := false;
    BEGIN
      PERFORM public.create_membership_with_access_scope(c_subject, v_org, v_role, v_actor, 'restricted', ARRAY[v_site, v_foreign], 'operator', NULL);
      RAISE EXCEPTION 'undo';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      v_ok := v_msg LIKE 'invite_site_not_in_org:%';
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'CASE 2 FAILED: foreign location not refused (got %)', v_msg; END IF;
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = c_subject) OR EXISTS (SELECT 1 FROM public.user_access_profiles WHERE user_id = c_subject) THEN
      RAISE EXCEPTION 'CASE 2 FAILED: a refused invitation left rows behind';
    END IF;
    RAISE NOTICE 'CASE 2 PASS foreign location refused, nothing written';
  ELSE
    RAISE NOTICE 'CASE 2 SKIP no non-site/foreign location in this seed';
  END IF;

  -- 3. An empty restriction and an unknown scope are refused, nothing written.
  v_ok := false;
  BEGIN
    PERFORM public.create_membership_with_access_scope(c_subject, v_org, v_role, v_actor, 'restricted', ARRAY[]::uuid[], 'operator', NULL);
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_ok := v_msg LIKE 'invite_site_scope_empty:%';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'CASE 3a FAILED: empty restriction not refused (got %)', v_msg; END IF;
  v_ok := false;
  BEGIN
    PERFORM public.create_membership_with_access_scope(c_subject, v_org, v_role, v_actor, 'nowhere', NULL, 'operator', NULL);
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_ok := v_msg LIKE 'invite_site_scope_invalid:%';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'CASE 3b FAILED: unknown scope not refused (got %)', v_msg; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = c_subject) THEN RAISE EXCEPTION 'CASE 3 FAILED: rows left behind'; END IF;
  RAISE NOTICE 'CASE 3 PASS empty and unknown scopes refused, nothing written';

  -- 4. The delegation ceiling still decides: an actor without authority (the subject itself, a non-member)
  --    is refused and nothing — not even the scope — is written.
  v_ok := false;
  BEGIN
    PERFORM public.create_membership_with_access_scope(c_subject, v_org, v_role, c_subject::text, 'restricted', ARRAY[v_site], 'operator', NULL);
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_ok := v_msg <> 'undo';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'CASE 4 FAILED: an actor without authority created a scoped membership'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = c_subject) OR EXISTS (SELECT 1 FROM public.user_site_access WHERE user_id = c_subject) THEN
    RAISE EXCEPTION 'CASE 4 FAILED: a refused delegation left rows behind';
  END IF;
  RAISE NOTICE 'CASE 4 PASS delegation ceiling refuses (%), nothing written', left(v_msg, 60);

  -- 5. An all-locations invitation through the same function is all/all with no site rows.
  BEGIN
    PERFORM public.create_membership_with_access_scope(c_subject, v_org, v_role, v_actor, 'all', NULL, 'operator', NULL);
    SET CONSTRAINTS ALL IMMEDIATE;
    SELECT * INTO v_p FROM public.user_access_profiles WHERE user_id = c_subject AND org_id = v_org;
    IF v_p IS NULL OR v_p.department_scope <> 'all' OR v_p.site_scope <> 'all' THEN RAISE EXCEPTION 'CASE 5 FAILED: profile is %/%', v_p.department_scope, v_p.site_scope; END IF;
    IF EXISTS (SELECT 1 FROM public.user_site_access WHERE user_id = c_subject) THEN RAISE EXCEPTION 'CASE 5 FAILED: site rows written'; END IF;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF v_msg <> 'undo' THEN RAISE EXCEPTION 'CASE 5 FAILED: %', v_msg; END IF;
  RAISE NOTICE 'CASE 5 PASS all-locations invitation is all/all';

  -- 6. No widening: everything equals the starting state.
  SELECT * INTO b FROM t_before;
  IF (SELECT count(*) FROM public.user_roles) <> b.memberships OR (SELECT count(*) FROM public.user_access_profiles) <> b.profiles
     OR (SELECT count(*) FROM public.user_site_access) <> b.site_rows OR (SELECT count(*) FROM public.user_department_access) <> b.dept_rows
     OR (SELECT count(*) FROM public.role_permission_grants) <> b.grants OR (SELECT count(*) FROM public.mutation_events) <> b.events
     OR (SELECT count(*) FROM public.user_access_profiles WHERE department_scope = 'restricted' OR site_scope = 'restricted') <> b.restricted THEN
    RAISE EXCEPTION 'CASE 6 FAILED: access state differs from the starting state';
  END IF;
  RAISE NOTICE 'CASE 6 PASS no widening: memberships %, profiles %, site rows %, grants %, restricted % unchanged', b.memberships, b.profiles, b.site_rows, b.grants, b.restricted;
END $$;
