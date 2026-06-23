-- Firefly: align enrollment builder with granular tour BP stages (supersedes coarse tour override).
-- Target org: 93667019-bd28-49b5-a688-acc9bb1e0a19.

DO $$
DECLARE
    c_org_id constant uuid := '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid;
    c_dept_id constant uuid := '3933ac47-077a-4de8-aaac-8aed48d80413'::uuid;
    c_process_id constant text := '42be9074-443f-4047-bece-d68cd1d22788';
    c_tour_scheduled_plan constant jsonb := jsonb_build_object(
        'version', 1, 'lifecycle_key', 'enrollment', 'stage_key', 'tour_scheduled',
        'journey_segment', 'family',
        'purpose', 'Tour is on the calendar. Confirmation and reminders are handled by tour comms.',
        'work_templates', '[]'::jsonb,
        'outcomes', jsonb_build_array(
            jsonb_build_object('outcome_key', 'tour_confirmed', 'label', 'Tour confirmed', 'successful', true),
            jsonb_build_object('outcome_key', 'reschedule', 'label', 'Reschedule tour'),
            jsonb_build_object('outcome_key', 'cancelled', 'label', 'Tour cancelled')
        ),
        'outcome_rules', jsonb_build_array(
            jsonb_build_object('rule_key', 'confirmed_noop', 'when_outcome_key', 'tour_confirmed',
                'targets', jsonb_build_array(jsonb_build_object('kind', 'mark_stage_work_complete'))),
            jsonb_build_object('rule_key', 'reschedule_noop', 'when_outcome_key', 'reschedule',
                'targets', jsonb_build_array(jsonb_build_object('kind', 'no_movement'))),
            jsonb_build_object('rule_key', 'cancelled_attention', 'when_outcome_key', 'cancelled',
                'targets', jsonb_build_array(jsonb_build_object('kind', 'create_needs_attention',
                    'attention_reason', 'Tour canceled — follow up required', 'wait_bucket', 'waiting_on_staff')))
        ),
        'attention_rules', '[]'::jsonb
    );
    c_tour_completed_plan constant jsonb := jsonb_build_object(
        'version', 1, 'lifecycle_key', 'enrollment', 'stage_key', 'tour_completed',
        'journey_segment', 'family', 'purpose', 'Record tour outcome and decide next steps.',
        'work_templates', jsonb_build_array(jsonb_build_object(
            'template_key', 'record_tour_outcome_work', 'label', 'Record tour outcome',
            'required', true, 'primary', true,
            'due_policy', jsonb_build_object('kind', 'offset_days', 'days', 1),
            'owner_strategy', 'record_owner', 'work_definition_key', 'record_tour_outcome'
        )),
        'outcomes', jsonb_build_array(
            jsonb_build_object('outcome_key', 'tour_completed', 'label', 'Tour completed', 'successful', true),
            jsonb_build_object('outcome_key', 'no_show', 'label', 'No show'),
            jsonb_build_object('outcome_key', 'not_interested', 'label', 'Not interested')
        ),
        'outcome_rules', jsonb_build_array(
            jsonb_build_object('rule_key', 'completed_to_decision', 'when_outcome_key', 'tour_completed',
                'targets', jsonb_build_array(
                    jsonb_build_object('kind', 'update_family_case_status', 'status_key', 'decision_pending'),
                    jsonb_build_object('kind', 'move_to_stage', 'stage_key', 'decision_pending'),
                    jsonb_build_object('kind', 'mark_stage_work_complete'))),
            jsonb_build_object('rule_key', 'no_show_attention', 'when_outcome_key', 'no_show',
                'targets', jsonb_build_array(jsonb_build_object('kind', 'create_needs_attention',
                    'attention_reason', 'Tour no-show — follow up required', 'wait_bucket', 'waiting_on_staff'))),
            jsonb_build_object('rule_key', 'not_interested_closed', 'when_outcome_key', 'not_interested',
                'targets', jsonb_build_array(
                    jsonb_build_object('kind', 'update_family_case_status', 'status_key', 'not_a_fit'),
                    jsonb_build_object('kind', 'mark_stage_work_complete')))
        ),
        'attention_rules', '[]'::jsonb
    );
    c_decision_pending_plan constant jsonb := jsonb_build_object(
        'version', 1, 'lifecycle_key', 'enrollment', 'stage_key', 'decision_pending',
        'journey_segment', 'family', 'purpose', 'Family is deciding enrollment path for each child.',
        'work_templates', jsonb_build_array(jsonb_build_object(
            'template_key', 'follow_up_decision', 'label', 'Follow up on enrollment decision',
            'required', true, 'primary', true,
            'due_policy', jsonb_build_object('kind', 'offset_days', 'days', 2),
            'owner_strategy', 'record_owner'
        )),
        'outcomes', jsonb_build_array(
            jsonb_build_object('outcome_key', 'enrolling', 'label', 'Enrolling', 'successful', true),
            jsonb_build_object('outcome_key', 'waitlist', 'label', 'Waitlist', 'successful', true),
            jsonb_build_object('outcome_key', 'declined', 'label', 'Declined')
        ),
        'outcome_rules', '[]'::jsonb,
        'attention_rules', '[]'::jsonb
    );
    c_legacy_tour_plan constant jsonb := jsonb_build_object(
        'version', 1, 'lifecycle_key', 'enrollment', 'stage_key', 'tour',
        'journey_segment', 'family', 'purpose', 'Legacy coarse tour stage — prefer granular tour stages.',
        'work_templates', '[]'::jsonb, 'outcomes', '[]'::jsonb,
        'outcome_rules', '[]'::jsonb, 'attention_rules', '[]'::jsonb
    );
    v_metadata jsonb;
    v_processes jsonb;
    v_process jsonb;
    v_stages jsonb;
    v_new_stages jsonb := '[]'::jsonb;
    v_stage jsonb;
    v_key text;
    v_has_tour_scheduled boolean := false;
    v_has_tour_completed boolean := false;
    v_has_decision_pending boolean := false;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = c_org_id) THEN
        RAISE NOTICE 'Firefly org absent; skipping granular tour BP stage alignment.';
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
        IF v_key = 'tour' THEN
            v_new_stages := v_new_stages || jsonb_set(v_stage, '{stage_operating_plan_v1}', c_legacy_tour_plan, true);
        ELSIF v_key = 'tour_scheduled' THEN
            v_has_tour_scheduled := true;
            v_new_stages := v_new_stages || jsonb_set(v_stage, '{stage_operating_plan_v1}', c_tour_scheduled_plan, true);
        ELSIF v_key = 'tour_completed' THEN
            v_has_tour_completed := true;
            v_new_stages := v_new_stages || jsonb_set(v_stage, '{stage_operating_plan_v1}', c_tour_completed_plan, true);
        ELSIF v_key = 'decision_pending' THEN
            v_has_decision_pending := true;
            v_new_stages := v_new_stages || jsonb_set(v_stage, '{stage_operating_plan_v1}', c_decision_pending_plan, true);
        ELSE
            v_new_stages := v_new_stages || v_stage;
        END IF;
    END LOOP;

    IF NOT v_has_tour_scheduled THEN
        v_new_stages := v_new_stages || jsonb_build_object(
            'id', gen_random_uuid()::text, 'key', 'tour_scheduled', 'label', 'Tour Scheduled',
            'sort_order', 25, 'is_active', true, 'stage_operating_plan_v1', c_tour_scheduled_plan
        );
    END IF;
    IF NOT v_has_tour_completed THEN
        v_new_stages := v_new_stages || jsonb_build_object(
            'id', gen_random_uuid()::text, 'key', 'tour_completed', 'label', 'Tour Completed',
            'sort_order', 30, 'is_active', true, 'stage_operating_plan_v1', c_tour_completed_plan
        );
    END IF;
    IF NOT v_has_decision_pending THEN
        v_new_stages := v_new_stages || jsonb_build_object(
            'id', gen_random_uuid()::text, 'key', 'decision_pending', 'label', 'Decision Pending',
            'sort_order', 35, 'is_active', true, 'stage_operating_plan_v1', c_decision_pending_plan
        );
    END IF;

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
