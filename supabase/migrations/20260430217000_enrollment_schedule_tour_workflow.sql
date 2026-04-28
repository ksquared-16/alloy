-- Per-org: demo workflow "Enrollment: Schedule Tour Follow-up" + org-scoped action_definitions.schedule_tour (start_workflow).
-- Global action_definitions.schedule_tour remains update_status for API consistency; execute + resolver prefer org row when present.
-- Removes the global record_section placement so each org uses org-scoped placement → org definition.

DELETE FROM public.action_placements
WHERE org_id IS NULL
  AND surface = 'record_section'
  AND entity_type = 'opportunity'
  AND section_key = 'opportunity_lifecycle';

DO $$
DECLARE
    r RECORD;
    v_wf_id uuid;
    v_def_id uuid;
BEGIN
    FOR r IN SELECT id FROM public.orgs LOOP
        SELECT w.id
        INTO v_wf_id
        FROM public.workflows w
        WHERE w.org_id = r.id AND w.name = 'Enrollment: Schedule Tour Follow-up'
        LIMIT 1;

        IF v_wf_id IS NULL THEN
            INSERT INTO public.workflows (name, description, event_type, entity_type, enabled, org_id)
            VALUES (
                'Enrollment: Schedule Tour Follow-up',
                'Manual follow-up from the opportunity drawer (demo): log-only steps; no outbound comms.',
                'opportunity_schedule_tour_followup',
                'opportunity',
                true,
                r.id
            )
            RETURNING id INTO v_wf_id;

            INSERT INTO public.workflow_actions (workflow_id, action_order, action_type, target_entity, payload, org_id)
            VALUES
                (
                    v_wf_id,
                    1,
                    'log',
                    NULL,
                    jsonb_build_object(
                        'message',
                        'Enrollment tour follow-up started for opportunity {{ opportunity.id }}'
                    ),
                    r.id
                ),
                (
                    v_wf_id,
                    2,
                    'log',
                    NULL,
                    jsonb_build_object(
                        'message',
                        'Next: assign tour or follow up with family (workflow stub).'
                    ),
                    r.id
                );
        END IF;

        SELECT d.id
        INTO v_def_id
        FROM public.action_definitions d
        WHERE d.org_id = r.id AND d.key = 'schedule_tour' AND d.action_type = 'start_workflow'
        LIMIT 1;

        IF v_def_id IS NULL THEN
            INSERT INTO public.action_definitions (
                org_id,
                key,
                label,
                description,
                entity_type,
                action_type,
                priority,
                payload_schema,
                workflow_id,
                is_active
            )
            VALUES (
                r.id,
                'schedule_tour',
                'Schedule tour',
                'Runs Enrollment: Schedule Tour Follow-up workflow (demo).',
                'opportunity',
                'start_workflow',
                55,
                '{}'::jsonb,
                v_wf_id,
                true
            )
            RETURNING id INTO v_def_id;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.action_placements p
            WHERE p.org_id = r.id
              AND p.surface = 'record_section'
              AND p.section_key = 'opportunity_lifecycle'
              AND p.action_definition_id = v_def_id
        ) THEN
            INSERT INTO public.action_placements (
                org_id,
                action_definition_id,
                surface,
                slot,
                entity_type,
                department_id,
                work_unit_id,
                section_key,
                order_index,
                display_style,
                is_active
            )
            VALUES (
                r.id,
                v_def_id,
                'record_section',
                'secondary',
                'opportunity',
                NULL,
                NULL,
                'opportunity_lifecycle',
                10,
                'button',
                true
            );
        END IF;
    END LOOP;
END $$;

