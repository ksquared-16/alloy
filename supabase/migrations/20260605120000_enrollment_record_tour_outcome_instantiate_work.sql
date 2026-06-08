-- C4: First end-to-end instantiate_work seed workflow (per org, idempotent).
-- Trigger: opportunity_status_changed → new_status_key = tour_scheduled
-- Action: instantiate_work → record_tour_outcome on event primary entity (opportunity)
--
-- Uses tour_scheduled (not tour_completed) so work is created when a tour is booked,
-- not after record_tour_outcome already captured the visit result.

DO $$
DECLARE
    r RECORD;
    v_wf_id uuid;
BEGIN
    FOR r IN SELECT id FROM public.orgs LOOP
        SELECT w.id
        INTO v_wf_id
        FROM public.workflows w
        WHERE w.org_id = r.id
          AND w.name = 'Enrollment: Record tour outcome on tour scheduled'
        LIMIT 1;

        IF v_wf_id IS NULL THEN
            INSERT INTO public.workflows (
                name,
                description,
                event_type,
                entity_type,
                enabled,
                org_id,
                metadata
            )
            VALUES (
                'Enrollment: Record tour outcome on tour scheduled',
                'Phase C4 proof path: when an opportunity reaches tour_scheduled, instantiate record_tour_outcome operational work via the workflow engine.',
                'opportunity_status_changed',
                'opportunities',
                true,
                r.id,
                jsonb_build_object(
                    'seed_key', 'c4_enrollment_record_tour_outcome_v1',
                    'operational_work_phase', 'c4',
                    'work_definition_key', 'record_tour_outcome'
                )
            )
            RETURNING id INTO v_wf_id;

            INSERT INTO public.workflow_conditions (workflow_id, field, operator, value, org_id)
            VALUES (
                v_wf_id,
                'new_status_key',
                'eq',
                'tour_scheduled',
                r.id
            );

            INSERT INTO public.workflow_actions (workflow_id, action_order, action_type, target_entity, payload, org_id)
            VALUES (
                v_wf_id,
                1,
                'instantiate_work',
                NULL,
                jsonb_build_object(
                    'version', 1,
                    'work_definition_key', 'record_tour_outcome',
                    'subject', jsonb_build_object('mode', 'event_primary_entity'),
                    'context_snapshot', jsonb_build_object('lifecycle_stage_key', 'tour'),
                    'on_deduped', 'soft_success',
                    'on_disabled_definition', 'skip',
                    'on_rejected', 'fail'
                ),
                r.id
            );
        END IF;
    END LOOP;
END $$;
