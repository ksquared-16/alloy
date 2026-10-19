-- Enrollment integrity — no child or participation is hard-deleted under its Enrollment journey
-- (migration 20261128090000), rollback-only. Run by database.run_rollback_invariant_test against an isolated
-- ALLOY_LOCAL_CERTIFICATION environment; the executor owns and discards the transaction; every case also undoes
-- its own writes ('undo'). A failed invariant RAISEs (ASSERTION_FAILED). Output: NOTICE lines.
CREATE TEMP TABLE t_before AS SELECT
  (SELECT count(*) FROM public.customer_members) AS children,
  (SELECT count(*) FROM public.opportunity_customer_members) AS participations,
  (SELECT count(*) FROM public.customers) AS households,
  (SELECT count(*) FROM public.process_instances) AS journeys;

DO $$
DECLARE
  v_org uuid; v_child uuid; v_house uuid; v_ocm uuid; v_journey uuid;
  v_msg text; v_ok boolean; b record;
BEGIN
  -- Subject: an existing seed child with a participation; a journey is anchored to it HERE (discarded with
  -- the transaction), exactly as Start Enrollment anchors one (subject child, context participation).
  SELECT m.org_id, m.id, m.customer_id, o.id INTO v_org, v_child, v_house, v_ocm
    FROM public.customer_members m JOIN public.opportunity_customer_members o ON o.customer_member_id = m.id
   WHERE m.relationship = 'child'
     AND NOT EXISTS (SELECT 1 FROM public.process_instances p WHERE p.subject_id = m.id)
   ORDER BY m.id LIMIT 1;
  IF v_child IS NULL THEN RAISE EXCEPTION 'SETUP no seed child with a participation'; END IF;
  INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, context_type, context_id)
  VALUES (v_org, 'enrollment', 'child', v_child, 'enrollment_participation', v_ocm)
  RETURNING id INTO v_journey;

  -- 1. The child cannot be hard-deleted under its journey — refused by the guard itself.
  v_ok := false;
  BEGIN
    DELETE FROM public.customer_members WHERE id = v_child;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_ok := v_msg = 'child_has_enrollment_journey';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'CASE 1 FAILED: child delete under a journey not refused by the guard (got %)', v_msg; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customer_members WHERE id = v_child) THEN RAISE EXCEPTION 'CASE 1 FAILED: child gone'; END IF;
  RAISE NOTICE 'CASE 1 PASS child delete refused (child_has_enrollment_journey)';

  -- 2. The participation the journey is anchored to cannot be deleted either.
  v_ok := false;
  BEGIN
    DELETE FROM public.opportunity_customer_members WHERE id = v_ocm;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_ok := v_msg = 'participation_has_enrollment_journey';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'CASE 2 FAILED: participation delete not refused by the guard (got %)', v_msg; END IF;
  RAISE NOTICE 'CASE 2 PASS participation delete refused (participation_has_enrollment_journey)';

  -- 3. A household delete that would cascade to the child is refused too; the household and child remain.
  v_ok := false;
  BEGIN
    DELETE FROM public.customers WHERE id = v_house;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_ok := v_msg <> 'undo';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'CASE 3 FAILED: household delete under a child journey succeeded'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customer_members WHERE id = v_child) THEN RAISE EXCEPTION 'CASE 3 FAILED: child gone'; END IF;
  RAISE NOTICE 'CASE 3 PASS household delete refused (%)', left(v_msg, 60);

  -- 4. Archiving the child is unaffected.
  BEGIN
    UPDATE public.customer_members SET is_active = false WHERE id = v_child;
    IF (SELECT is_active FROM public.customer_members WHERE id = v_child) THEN RAISE EXCEPTION 'CASE 4 FAILED: archive did not apply'; END IF;
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF v_msg <> 'undo' THEN RAISE EXCEPTION 'CASE 4 FAILED: %', v_msg; END IF;
  RAISE NOTICE 'CASE 4 PASS archive (is_active=false) allowed';

  -- 5. The supported cleanup order lifts the guard: remove the journey's sessions, then the journey — the
  --    child delete is then no longer refused BY THE GUARD (another existing RESTRICT may still apply).
  BEGIN
    DELETE FROM public.form_packet_sessions WHERE process_instance_id = v_journey;
    DELETE FROM public.process_instances WHERE id = v_journey;
    BEGIN
      DELETE FROM public.opportunity_customer_members WHERE id = v_ocm;
      DELETE FROM public.customer_members WHERE id = v_child;
      v_msg := 'deleted';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    END;
    IF v_msg IN ('child_has_enrollment_journey', 'participation_has_enrollment_journey') THEN
      RAISE EXCEPTION 'CASE 5 FAILED: the guard still refused after the journey was removed (%)', v_msg;
    END IF;
    RAISE NOTICE 'CASE 5 PASS guard lifts once the journey is removed (child delete: %)', left(v_msg, 60);
    RAISE EXCEPTION 'undo';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'undo' THEN RAISE EXCEPTION '%', v_msg; END IF;
  END;

  -- 6. Nothing persisted: after removing the test journey, every count equals the start.
  DELETE FROM public.process_instances WHERE id = v_journey;
  SELECT * INTO b FROM t_before;
  IF (SELECT count(*) FROM public.customer_members) <> b.children OR (SELECT count(*) FROM public.opportunity_customer_members) <> b.participations
     OR (SELECT count(*) FROM public.customers) <> b.households OR (SELECT count(*) FROM public.process_instances) <> b.journeys THEN
    RAISE EXCEPTION 'CASE 6 FAILED: state differs from the start';
  END IF;
  RAISE NOTICE 'CASE 6 PASS no change: children %, participations %, households %, journeys %', b.children, b.participations, b.households, b.journeys;
END $$;
