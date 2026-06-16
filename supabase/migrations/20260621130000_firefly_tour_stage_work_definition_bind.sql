-- Firefly: bind tour stage primary work template to platform work definition contact_family.
-- Default enrollment plan uses confirm_tour_date without work_definition_key (not in catalog).
-- Target org: 93667019-bd28-49b5-a688-acc9bb1e0a19.

DO $$
DECLARE
    c_org_id constant uuid := '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid;
    c_dept_id constant uuid := '3933ac47-077a-4de8-aaac-8aed48d80413'::uuid;
    c_process_id constant text := '42be9074-443f-4047-bece-d68cd1d22788';
    c_tour_plan constant jsonb := jsonb_build_object(
        'version', 1,
        'lifecycle_key', 'enrollment',
        'stage_key', 'tour',
        'journey_segment', 'family',
        'purpose', 'Schedule, confirm, and follow up on tours.',
        'work_templates', jsonb_build_array(
            jsonb_build_object(
                'template_key', 'confirm_tour_date',
                'label', 'Confirm tour date',
                'required', true,
                'primary', true,
                'due_policy', jsonb_build_object('kind', 'same_day'),
                'owner_strategy', 'record_owner',
                'work_definition_key', 'contact_family'
            )
        ),
        'outcomes', jsonb_build_array(
            jsonb_build_object('outcome_key', 'tour_confirmed', 'label', 'Tour confirmed', 'successful', true)
        ),
        'outcome_rules', jsonb_build_array(
            jsonb_build_object(
                'rule_key', 'confirmed_ack',
                'when_outcome_key', 'tour_confirmed',
                'targets', jsonb_build_array(jsonb_build_object('kind', 'mark_stage_work_complete'))
            )
        ),
        'attention_rules', '[]'::jsonb
    );
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = c_org_id) THEN
        RAISE NOTICE 'Firefly org absent; skipping tour stage operating plan bind.';
        RETURN;
    END IF;

    UPDATE public.departments AS d
    SET
        metadata = jsonb_set(
            d.metadata,
            '{lifecycle_builder_v1,processes}',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        CASE
                            WHEN p->>'id' = c_process_id THEN
                                jsonb_set(
                                    p,
                                    '{stages}',
                                    COALESCE(
                                        (
                                            SELECT jsonb_agg(
                                                CASE
                                                    WHEN s->>'key' = 'tour'
                                                    THEN jsonb_set(s, '{stage_operating_plan_v1}', c_tour_plan, true)
                                                    ELSE s
                                                END
                                                ORDER BY ord
                                            )
                                            FROM jsonb_array_elements(p->'stages') WITH ORDINALITY AS t(s, ord)
                                        ),
                                        '[]'::jsonb
                                    ),
                                    true
                                )
                            ELSE p
                        END
                        ORDER BY pord
                    )
                    FROM jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') WITH ORDINALITY AS pt(p, pord)
                ),
                '[]'::jsonb
            ),
            true
        ),
        updated_at = now()
    WHERE d.id = c_dept_id
      AND d.org_id = c_org_id;
END$$;
