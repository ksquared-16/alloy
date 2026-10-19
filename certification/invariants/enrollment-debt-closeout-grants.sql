-- PR #1503 final certification — supplementary, rollback-only: processing_case_subject_removed is EXECUTED
-- (not only granted) by service_role and refused to authenticated and anon; a household of ANOTHER org never
-- counts as present; existing historical cases stay readable; nothing persists. Run by
-- database.run_rollback_invariant_test on an isolated ALLOY_LOCAL_CERTIFICATION environment.
CREATE TEMP TABLE t_g_before AS SELECT
  (SELECT count(*) FROM public.processing_cases) AS cases,
  (SELECT count(*) FROM public.processing_case_sources) AS sources,
  (SELECT count(*) FROM public.form_packet_sessions) AS sessions,
  (SELECT count(*) FROM public.form_public_links) AS links,
  (SELECT count(*) FROM public.customers) AS households;

DO $$
DECLARE
  v_org uuid; v_other_org uuid; v_house uuid; v_foreign_house uuid; v_child uuid;
  v_form uuid; v_pdef uuid; v_link uuid; v_session uuid; v_case uuid;
  v_msg text; v_state text; v_flag boolean; v_n bigint; b record;
BEGIN
  SELECT m.org_id, m.customer_id, m.id INTO v_org, v_house, v_child
    FROM public.customer_members m WHERE m.relationship = 'child' AND m.is_active IS NOT FALSE ORDER BY m.id LIMIT 1;
  IF v_child IS NULL THEN RAISE EXCEPTION 'SETUP no seed child'; END IF;
  SELECT o.id INTO v_other_org FROM public.orgs o WHERE o.id <> v_org ORDER BY o.id LIMIT 1;

  BEGIN
    INSERT INTO public.form_definitions (org_id, key, name, kind) VALUES (v_org, 'inv-grant-' || gen_random_uuid(), 'Invariant form', 'center') RETURNING id INTO v_form;
    INSERT INTO public.form_packet_definitions (org_id, name) VALUES (v_org, 'Invariant packet') RETURNING id INTO v_pdef;
    INSERT INTO public.form_public_links (org_id, token_hash, form_definition_id, metadata)
    VALUES (v_org, 'inv-' || gen_random_uuid(), v_form, jsonb_build_object('created_via', 'enrollment_start')) RETURNING id INTO v_link;
    INSERT INTO public.form_packet_sessions (org_id, packet_definition_id, started_via_public_link_id, crm_snapshot)
    VALUES (v_org, v_pdef, v_link, jsonb_build_object('customer_id', v_house, 'customer_member_id', v_child)) RETURNING id INTO v_session;
    INSERT INTO public.processing_cases (org_id) VALUES (v_org) RETURNING id INTO v_case;
    INSERT INTO public.processing_case_sources (org_id, processing_case_id, source_kind, source_id, role)
    VALUES (v_org, v_case, 'form_packet_session', v_session, 'primary');

    -- G1. service_role EXECUTES it and gets the answer.
    SET LOCAL ROLE service_role;
    SELECT public.processing_case_subject_removed(c) INTO v_flag FROM public.processing_cases c WHERE c.id = v_case;
    SET LOCAL ROLE NONE;
    IF v_flag IS DISTINCT FROM false THEN RAISE EXCEPTION 'G1 FAILED: service_role read % for a live case', v_flag; END IF;
    RAISE NOTICE 'G1 PASS service_role executes the function (live case → false)';

    -- G2. authenticated is refused (insufficient_privilege), even on a row it is handed.
    v_state := NULL;
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM public.processing_case_subject_removed(c) FROM public.processing_cases c WHERE c.id = v_case;
      RAISE EXCEPTION 'undo';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    SET LOCAL ROLE NONE;
    IF v_state <> '42501' THEN RAISE EXCEPTION 'G2 FAILED: authenticated was not refused (% %)', v_state, v_msg; END IF;
    RAISE NOTICE 'G2 PASS authenticated refused (42501)';

    -- G3. anon is refused.
    v_state := NULL;
    BEGIN
      SET LOCAL ROLE anon;
      PERFORM public.processing_case_subject_removed(c) FROM public.processing_cases c WHERE c.id = v_case;
      RAISE EXCEPTION 'undo';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    SET LOCAL ROLE NONE;
    IF v_state <> '42501' THEN RAISE EXCEPTION 'G3 FAILED: anon was not refused (% %)', v_state, v_msg; END IF;
    RAISE NOTICE 'G3 PASS anon refused (42501)';

    -- G4. The only grantees are the owner and service_role (no PUBLIC, anon or authenticated entry).
    SELECT count(*) INTO v_n FROM pg_proc p, aclexplode(p.proacl) a
     WHERE p.oid = 'public.processing_case_subject_removed(public.processing_cases)'::regprocedure
       AND a.grantee NOT IN (p.proowner, 'service_role'::regrole);
    IF v_n <> 0 THEN RAISE EXCEPTION 'G4 FAILED: % unexpected grantee entries', v_n; END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.processing_case_subject_removed(public.processing_cases)'::regprocedure) THEN
      RAISE EXCEPTION 'G4 FAILED: not security definer';
    END IF;
    RAISE NOTICE 'G4 PASS grantees are the owner and service_role only; security definer; pinned search_path %',
      (SELECT proconfig FROM pg_proc WHERE oid = 'public.processing_case_subject_removed(public.processing_cases)'::regprocedure);

    -- G5. Tenant isolation: a snapshot naming a household of ANOTHER org is never "present" for this org's case.
    IF v_other_org IS NOT NULL THEN
      SELECT c.id INTO v_foreign_house FROM public.customers c WHERE c.org_id = v_other_org ORDER BY c.id LIMIT 1;
    END IF;
    IF v_foreign_house IS NOT NULL THEN
      UPDATE public.form_packet_sessions SET crm_snapshot = jsonb_build_object('customer_id', v_foreign_house) WHERE id = v_session;
      IF NOT (SELECT public.processing_case_subject_removed(c) FROM public.processing_cases c WHERE c.id = v_case) THEN
        RAISE EXCEPTION 'G5 FAILED: another org''s household counted as present';
      END IF;
      RAISE NOTICE 'G5 PASS another org''s household is not this org''s family (evidence only)';
    ELSE
      RAISE NOTICE 'G5 SKIP no second org with a household in this baseline';
    END IF;

    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; IF v_msg <> 'undo' THEN RAISE EXCEPTION '%', v_msg; END IF;
  END;

  -- G6. Existing historical cases stay readable, and the flag reads across all of them without error.
  SELECT count(*) INTO v_n FROM public.processing_cases c WHERE public.processing_case_subject_removed(c) IS NOT NULL;
  IF v_n <> (SELECT count(*) FROM public.processing_cases) THEN RAISE EXCEPTION 'G6 FAILED: flag unreadable on % cases', v_n; END IF;
  RAISE NOTICE 'G6 PASS every existing case is readable and classified (% cases)', v_n;

  -- G7. Nothing persisted.
  SELECT * INTO b FROM t_g_before;
  IF (SELECT count(*) FROM public.processing_cases) <> b.cases OR (SELECT count(*) FROM public.processing_case_sources) <> b.sources
     OR (SELECT count(*) FROM public.form_packet_sessions) <> b.sessions OR (SELECT count(*) FROM public.form_public_links) <> b.links
     OR (SELECT count(*) FROM public.customers) <> b.households THEN
    RAISE EXCEPTION 'G7 FAILED: state differs from the start';
  END IF;
  RAISE NOTICE 'G7 PASS no change: cases %, sessions %, links %, households %', b.cases, b.sessions, b.links, b.households;
END $$;
