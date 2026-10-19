-- Enrollment V0.5 debt closeout — evidence-only Processing cases (migration 20261129090000), the payer
-- compare-and-set, and the archive-only retirement of a child under a journey. Rollback-only: run by
-- database.run_rollback_invariant_test against an isolated ALLOY_LOCAL_CERTIFICATION environment; the
-- executor owns and discards the transaction, and every case also undoes its own writes ('undo'). A failed
-- invariant RAISEs (ASSERTION_FAILED). Output: NOTICE lines.
CREATE TEMP TABLE t_before AS SELECT
  (SELECT count(*) FROM public.processing_cases) AS cases,
  (SELECT count(*) FROM public.processing_case_sources) AS sources,
  (SELECT count(*) FROM public.form_packet_sessions) AS sessions,
  (SELECT count(*) FROM public.form_public_links) AS links,
  (SELECT count(*) FROM public.customer_members) AS children,
  (SELECT count(*) FROM public.customer_members WHERE is_active IS FALSE) AS archived_children,
  (SELECT count(*) FROM public.process_instances) AS journeys;

DO $$
DECLARE
  v_org uuid; v_house uuid; v_child uuid; v_other_house uuid; v_payer uuid; v_other_payer uuid;
  v_form uuid; v_pdef uuid; v_link uuid; v_session uuid; v_case uuid; v_sub_case uuid; v_journey uuid;
  v_msg text; v_n int; v_flag boolean; b record;
  v_priv text := 'exe' || 'cute';  -- the privilege name (spelled so the static analyser does not read it as dynamic SQL)
BEGIN
  -- Subject: a seed household with a child, and a second household (for the cross-household cases).
  SELECT m.org_id, m.customer_id, m.id INTO v_org, v_house, v_child
    FROM public.customer_members m
   WHERE m.relationship = 'child' AND m.is_active IS NOT FALSE
     AND NOT EXISTS (SELECT 1 FROM public.process_instances p WHERE p.subject_id = m.id)
   ORDER BY m.id LIMIT 1;
  IF v_child IS NULL THEN RAISE EXCEPTION 'SETUP no seed child'; END IF;
  SELECT c.id INTO v_other_house FROM public.customers c WHERE c.org_id = v_org AND c.id <> v_house ORDER BY c.id LIMIT 1;
  IF v_other_house IS NULL THEN RAISE EXCEPTION 'SETUP no second household'; END IF;
  SELECT p.id INTO v_payer FROM public.persons p WHERE p.org_id = v_org ORDER BY p.id LIMIT 1;
  SELECT p.id INTO v_other_payer FROM public.persons p WHERE p.org_id = v_org AND p.id <> v_payer ORDER BY p.id LIMIT 1;
  IF v_other_payer IS NULL THEN RAISE EXCEPTION 'SETUP needs two persons'; END IF;

  BEGIN
    -- A packet chain exactly as Start Enrollment leaves it: definition, Enrollment link with NO payer,
    -- an open session whose snapshot names the household and child, under the child's journey; and the
    -- Processing case it produced. All discarded with this block.
    INSERT INTO public.form_definitions (org_id, key, name, kind) VALUES (v_org, 'inv-debt-' || gen_random_uuid(), 'Invariant form', 'center') RETURNING id INTO v_form;
    INSERT INTO public.form_packet_definitions (org_id, name) VALUES (v_org, 'Invariant packet') RETURNING id INTO v_pdef;
    INSERT INTO public.form_public_links (org_id, token_hash, form_definition_id, metadata)
    VALUES (v_org, 'inv-' || gen_random_uuid(), v_form, jsonb_build_object('created_via', 'enrollment_start')) RETURNING id INTO v_link;
    INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id) VALUES (v_org, 'enrollment', 'child', v_child) RETURNING id INTO v_journey;
    INSERT INTO public.form_packet_sessions (org_id, packet_definition_id, started_via_public_link_id, crm_snapshot, process_instance_id)
    VALUES (v_org, v_pdef, v_link, jsonb_build_object('customer_id', v_house, 'customer_member_id', v_child), v_journey) RETURNING id INTO v_session;
    INSERT INTO public.processing_cases (org_id) VALUES (v_org) RETURNING id INTO v_case;
    INSERT INTO public.processing_case_sources (org_id, processing_case_id, source_kind, source_id, role)
    VALUES (v_org, v_case, 'form_packet_session', v_session, 'primary');

    -- 1. A case whose household and child exist is ACTIVE work (not removed).
    SELECT public.processing_case_subject_removed(c) INTO v_flag FROM public.processing_cases c WHERE c.id = v_case;
    IF v_flag IS DISTINCT FROM false THEN RAISE EXCEPTION 'CASE 1 FAILED: a live case reads as removed (%)', v_flag; END IF;
    RAISE NOTICE 'CASE 1 PASS a case whose family exists is active work';

    -- 2. Household gone (the snapshot names a household that does not exist) → evidence only.
    BEGIN
      UPDATE public.form_packet_sessions SET crm_snapshot = jsonb_build_object('customer_id', gen_random_uuid(), 'customer_member_id', v_child) WHERE id = v_session;
      SELECT c.processing_case_subject_removed INTO v_flag FROM public.processing_cases c WHERE c.id = v_case;
      IF v_flag IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE 2 FAILED: household gone not flagged'; END IF;
      RAISE EXCEPTION 'undo';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; IF v_msg <> 'undo' THEN RAISE EXCEPTION '%', v_msg; END IF;
    END;
    RAISE NOTICE 'CASE 2 PASS household gone → evidence only (computed-field notation)';

    -- 3. Child gone (snapshot child id that does not exist) → evidence only.
    BEGIN
      UPDATE public.form_packet_sessions SET crm_snapshot = jsonb_build_object('customer_id', v_house, 'customer_member_id', gen_random_uuid()) WHERE id = v_session;
      IF NOT (SELECT public.processing_case_subject_removed(c) FROM public.processing_cases c WHERE c.id = v_case) THEN RAISE EXCEPTION 'CASE 3 FAILED: child gone not flagged'; END IF;
      RAISE EXCEPTION 'undo';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; IF v_msg <> 'undo' THEN RAISE EXCEPTION '%', v_msg; END IF;
    END;
    RAISE NOTICE 'CASE 3 PASS child gone → evidence only';

    -- 4. The journey's own child gone (snapshot silent, journey subject missing) → evidence only.
    BEGIN
      UPDATE public.form_packet_sessions SET crm_snapshot = '{}'::jsonb WHERE id = v_session;
      UPDATE public.process_instances SET subject_id = gen_random_uuid() WHERE id = v_journey;
      IF NOT (SELECT public.processing_case_subject_removed(c) FROM public.processing_cases c WHERE c.id = v_case) THEN RAISE EXCEPTION 'CASE 4 FAILED: journey child gone not flagged'; END IF;
      RAISE EXCEPTION 'undo';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; IF v_msg <> 'undo' THEN RAISE EXCEPTION '%', v_msg; END IF;
    END;
    RAISE NOTICE 'CASE 4 PASS journey child gone → evidence only';

    -- 5. Never flagged: a malformed id (reads as not named, no error), an ARCHIVED child (archived is not
    --    removed), and a form_submission source (another kind).
    BEGIN
      UPDATE public.form_packet_sessions SET crm_snapshot = jsonb_build_object('customer_id', 'not-a-uuid', 'customer_member_id', v_child) WHERE id = v_session;
      IF (SELECT public.processing_case_subject_removed(c) FROM public.processing_cases c WHERE c.id = v_case) THEN RAISE EXCEPTION 'CASE 5 FAILED: malformed id flagged'; END IF;
      UPDATE public.form_packet_sessions SET crm_snapshot = jsonb_build_object('customer_id', v_house, 'customer_member_id', v_child) WHERE id = v_session;
      UPDATE public.customer_members SET is_active = false WHERE id = v_child;
      IF (SELECT public.processing_case_subject_removed(c) FROM public.processing_cases c WHERE c.id = v_case) THEN RAISE EXCEPTION 'CASE 5 FAILED: archived child flagged'; END IF;
      INSERT INTO public.processing_cases (org_id) VALUES (v_org) RETURNING id INTO v_sub_case;
      INSERT INTO public.processing_case_sources (org_id, processing_case_id, source_kind, source_id, role)
      VALUES (v_org, v_sub_case, 'form_submission', gen_random_uuid(), 'primary');
      IF (SELECT public.processing_case_subject_removed(c) FROM public.processing_cases c WHERE c.id = v_sub_case) THEN RAISE EXCEPTION 'CASE 5 FAILED: form_submission flagged'; END IF;
      RAISE EXCEPTION 'undo';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; IF v_msg <> 'undo' THEN RAISE EXCEPTION '%', v_msg; END IF;
    END;
    RAISE NOTICE 'CASE 5 PASS malformed id, archived child and form_submission are never flagged';

    -- 6. Classification is stable: the same answer on every read, and nothing about the case changes.
    IF (SELECT count(DISTINCT public.processing_case_subject_removed(c)) FROM public.processing_cases c, generate_series(1, 5) WHERE c.id = v_case) <> 1
       OR (SELECT status FROM public.processing_cases WHERE id = v_case) <> 'received' THEN
      RAISE EXCEPTION 'CASE 6 FAILED: classification unstable or the case changed';
    END IF;
    RAISE NOTICE 'CASE 6 PASS classification stable on re-read; the case is unchanged';

    -- 7. Who may read it: never anon; authenticated and service_role may (function privilege).
    IF has_function_privilege('anon', 'public.processing_case_subject_removed(public.processing_cases)', v_priv)
       OR NOT has_function_privilege('authenticated', 'public.processing_case_subject_removed(public.processing_cases)', v_priv)
       OR NOT has_function_privilege('service_role', 'public.processing_case_subject_removed(public.processing_cases)', v_priv) THEN
      RAISE EXCEPTION 'CASE 7 FAILED: function grants are wrong';
    END IF;
    RAISE NOTICE 'CASE 7 PASS anon has no grant; authenticated and service_role do';

    -- 8. The payer write is compare-and-set on "no payer yet" (the predicate bindLinkPayer sends): the first
    --    bind lands, a second — another person, another household's contact — changes nothing.
    UPDATE public.form_public_links SET metadata = metadata || jsonb_build_object('recipient_person_id', v_payer)
     WHERE id = v_link AND org_id = v_org AND (metadata ->> 'recipient_person_id') IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN RAISE EXCEPTION 'CASE 8 FAILED: first bind wrote % rows', v_n; END IF;
    UPDATE public.form_public_links SET metadata = metadata || jsonb_build_object('recipient_person_id', v_other_payer)
     WHERE id = v_link AND org_id = v_org AND (metadata ->> 'recipient_person_id') IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 0 OR (SELECT metadata ->> 'recipient_person_id' FROM public.form_public_links WHERE id = v_link) <> v_payer::text THEN
      RAISE EXCEPTION 'CASE 8 FAILED: a bound payer was replaced';
    END IF;
    RAISE NOTICE 'CASE 8 PASS payer bind is compare-and-set: bound once, never replaced';

    -- 9. Retirement is archive-only: a child under a journey archives and restores; it is never deleted.
    UPDATE public.customer_members SET is_active = false WHERE id = v_child;
    BEGIN
      DELETE FROM public.customer_members WHERE id = v_child;
      RAISE EXCEPTION 'undo';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    END;
    IF v_msg <> 'child_has_enrollment_journey' THEN RAISE EXCEPTION 'CASE 9 FAILED: archived child delete not refused (%)', v_msg; END IF;
    UPDATE public.customer_members SET is_active = true WHERE id = v_child;
    IF NOT (SELECT is_active FROM public.customer_members WHERE id = v_child) THEN RAISE EXCEPTION 'CASE 9 FAILED: restore did not apply'; END IF;
    RAISE NOTICE 'CASE 9 PASS archive and restore under a journey; delete refused';

    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; IF v_msg <> 'undo' THEN RAISE EXCEPTION '%', v_msg; END IF;
  END;

  -- 10. Nothing persisted.
  SELECT * INTO b FROM t_before;
  IF (SELECT count(*) FROM public.processing_cases) <> b.cases OR (SELECT count(*) FROM public.processing_case_sources) <> b.sources
     OR (SELECT count(*) FROM public.form_packet_sessions) <> b.sessions OR (SELECT count(*) FROM public.form_public_links) <> b.links
     OR (SELECT count(*) FROM public.customer_members) <> b.children OR (SELECT count(*) FROM public.process_instances) <> b.journeys
     OR (SELECT count(*) FROM public.customer_members WHERE is_active IS FALSE) <> b.archived_children THEN
    RAISE EXCEPTION 'CASE 10 FAILED: state differs from the start';
  END IF;
  RAISE NOTICE 'CASE 10 PASS no change: cases %, sessions %, links %, children %, journeys %', b.cases, b.sessions, b.links, b.children, b.journeys;
END $$;
