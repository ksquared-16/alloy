-- Firefly: add status-entry and domain-signal automation rules to explicit tour_scheduled plan.
-- Supplements 20260622130000 (explicit builder override bypasses enrollment defaults).
-- Target org: 93667019-bd28-49b5-a688-acc9bb1e0a19.

DO $$
DECLARE
    c_org_id constant uuid := '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid;
    c_dept_id constant uuid := '3933ac47-077a-4de8-aaac-8aed48d80413'::uuid;
    c_process_id constant text := '42be9074-443f-4047-bece-d68cd1d22788';
    c_no_show_rule constant jsonb := jsonb_build_object(
        'rule_key', 'status_tour_no_show_attention',
        'when_enter_status_key', 'tour_no_show',
        'targets', jsonb_build_array(jsonb_build_object(
            'kind', 'create_needs_attention',
            'attention_reason', 'Tour no-show — follow up required',
            'wait_bucket', 'waiting_on_staff'
        ))
    );
    c_cancel_signal_rule constant jsonb := jsonb_build_object(
        'rule_key', 'domain_tour_booking_canceled_attention',
        'when_domain_signal', jsonb_build_object('domain', 'tour_booking', 'signal', 'canceled'),
        'targets', jsonb_build_array(jsonb_build_object(
            'kind', 'create_needs_attention',
            'attention_reason', 'Tour canceled — follow up required',
            'wait_bucket', 'waiting_on_staff'
        ))
    );
    v_metadata jsonb;
    v_processes jsonb;
    v_process jsonb;
    v_stages jsonb;
    v_new_stages jsonb := '[]'::jsonb;
    v_stage jsonb;
    v_plan jsonb;
    v_rules jsonb;
    v_rule jsonb;
    v_key text;
    v_has_no_show boolean := false;
    v_has_cancel_signal boolean := false;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = c_org_id) THEN
        RAISE NOTICE 'Firefly org absent; skipping tour_scheduled automation rule patch.';
        RETURN;
    END IF;

    SELECT metadata INTO v_metadata
    FROM public.departments
    WHERE id = c_dept_id AND org_id = c_org_id;

    IF v_metadata IS NULL THEN
        RAISE NOTICE 'Firefly enrollment department absent; skipping.';
        RETURN;
    END IF;

    v_processes := v_metadata #> '{lifecycle_builder_v1,processes}';
    IF v_processes IS NULL THEN RETURN; END IF;

    SELECT elem INTO v_process
    FROM jsonb_array_elements(v_processes) AS elem
    WHERE elem->>'id' = c_process_id
    LIMIT 1;

    IF v_process IS NULL THEN RETURN; END IF;

    v_stages := COALESCE(v_process->'stages', '[]'::jsonb);

    FOR v_stage IN SELECT value FROM jsonb_array_elements(v_stages)
    LOOP
        v_key := v_stage->>'key';
        IF v_key = 'tour_scheduled' THEN
            v_plan := COALESCE(v_stage->'stage_operating_plan_v1', '{}'::jsonb);
            v_rules := COALESCE(v_plan->'outcome_rules', '[]'::jsonb);

            FOR v_rule IN SELECT value FROM jsonb_array_elements(v_rules)
            LOOP
                IF v_rule->>'rule_key' = 'status_tour_no_show_attention' THEN v_has_no_show := true; END IF;
                IF v_rule->>'rule_key' = 'domain_tour_booking_canceled_attention' THEN v_has_cancel_signal := true; END IF;
            END LOOP;

            IF NOT v_has_no_show THEN
                v_rules := v_rules || c_no_show_rule;
            END IF;
            IF NOT v_has_cancel_signal THEN
                v_rules := v_rules || c_cancel_signal_rule;
            END IF;

            v_plan := jsonb_set(v_plan, '{outcome_rules}', v_rules, true);
            v_stage := jsonb_set(v_stage, '{stage_operating_plan_v1}', v_plan, true);
        END IF;
        v_new_stages := v_new_stages || v_stage;
    END LOOP;

    v_process := jsonb_set(v_process, '{stages}', v_new_stages, true);

    v_processes := (
        SELECT jsonb_agg(
            CASE WHEN elem->>'id' = c_process_id THEN v_process ELSE elem END
            ORDER BY ord
        )
        FROM jsonb_array_elements(v_processes) WITH ORDINALITY AS t(elem, ord)
    );

    UPDATE public.departments
    SET
        metadata = jsonb_set(v_metadata, '{lifecycle_builder_v1,processes}', v_processes, true),
        updated_at = now()
    WHERE id = c_dept_id AND org_id = c_org_id;
END$$;
