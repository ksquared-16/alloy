-- Enrollment: add registry-backed reschedule_tour + minimal v1 condition_config.
-- - schedule_tour shows when metadata.tour_date is missing
-- - reschedule_tour shows when metadata.tour_date exists
-- Note: conditions are evaluated server-side in `resolveActionsForContext` (v1).
DO $$
DECLARE
    r RECORD;
    schedule_def_id uuid;
    reschedule_def_id uuid;
BEGIN
    FOR r IN
        SELECT id
        FROM public.orgs
    LOOP
        -- Ensure org-scoped schedule_tour has condition_config (hide when tour_date exists).
        UPDATE public.action_definitions d
        SET condition_config = jsonb_build_object('metadata_field_missing', 'tour_date')
        WHERE d.org_id = r.id
          AND d.key = 'schedule_tour'
          AND d.is_active = true;

        -- Create org-scoped reschedule_tour by copying schedule_tour workflow + form payload.
        INSERT INTO public.action_definitions (
            org_id, key, label, description, entity_type, action_type,
            icon, style, priority, condition_config, payload_schema, workflow_id, is_active
        )
        SELECT
            r.id,
            'reschedule_tour',
            'Reschedule tour',
            'Reschedule an existing tour (v1 Action Form)',
            d.entity_type,
            d.action_type,
            d.icon,
            d.style,
            d.priority,
            jsonb_build_object('metadata_field_exists', 'tour_date'),
            -- Reuse same form_key; server execute uses action_key to select definition/workflow.
            jsonb_set(
                COALESCE(d.payload_schema, '{}'::jsonb),
                '{event_payload,action_key}',
                to_jsonb('reschedule_tour'::text),
                true
            ),
            d.workflow_id,
            true
        FROM public.action_definitions d
        WHERE d.org_id = r.id
          AND d.key = 'schedule_tour'
          AND d.is_active = true
          AND NOT EXISTS (
              SELECT 1
              FROM public.action_definitions x
              WHERE x.org_id = r.id
                AND x.key = 'reschedule_tour'
          );

        -- Add org-scoped record_header placement for schedule_tour + reschedule_tour (dedupe prefers org-scoped).
        SELECT id INTO schedule_def_id
        FROM public.action_definitions
        WHERE org_id = r.id AND key = 'schedule_tour'
        LIMIT 1;

        IF schedule_def_id IS NOT NULL THEN
            INSERT INTO public.action_placements (
                org_id, action_definition_id, surface, slot, entity_type,
                department_id, work_unit_id, section_key, order_index, display_style, is_active
            )
            SELECT
                r.id,
                schedule_def_id,
                'record_header'::text,
                'secondary'::text,
                'opportunity'::text,
                NULL::uuid,
                NULL::uuid,
                NULL::text,
                10,
                'button'::text,
                true
            WHERE NOT EXISTS (
                SELECT 1
                FROM public.action_placements p
                WHERE p.org_id = r.id
                  AND p.action_definition_id = schedule_def_id
                  AND p.surface = 'record_header'
                  AND p.slot = 'secondary'
                  AND p.entity_type = 'opportunity'
            );
        END IF;

        SELECT id INTO reschedule_def_id
        FROM public.action_definitions
        WHERE org_id = r.id AND key = 'reschedule_tour'
        LIMIT 1;

        IF reschedule_def_id IS NOT NULL THEN
            INSERT INTO public.action_placements (
                org_id, action_definition_id, surface, slot, entity_type,
                department_id, work_unit_id, section_key, order_index, display_style, is_active
            )
            SELECT
                r.id,
                reschedule_def_id,
                'record_header'::text,
                'secondary'::text,
                'opportunity'::text,
                NULL::uuid,
                NULL::uuid,
                NULL::text,
                11,
                'button'::text,
                true
            WHERE NOT EXISTS (
                SELECT 1
                FROM public.action_placements p
                WHERE p.org_id = r.id
                  AND p.action_definition_id = reschedule_def_id
                  AND p.surface = 'record_header'
                  AND p.slot = 'secondary'
                  AND p.entity_type = 'opportunity'
            );
        END IF;
    END LOOP;
END $$;

