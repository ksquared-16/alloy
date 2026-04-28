-- Convert per-org schedule_tour action to open_form (v1 Action Forms).
-- The form collects tour_date + tour_time, then submits to start_workflow using existing workflow_id.
--
-- Notes:
-- - We keep global action_definitions.schedule_tour as update_status for legacy/API consistency.
-- - Resolver prefers org-scoped definitions when present.
-- - Server execute treats open_form as "validate required fields then run submit_action_type".
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT id
        FROM public.orgs
    LOOP
        UPDATE public.action_definitions d
        SET
            action_type = 'open_form',
            -- Keep workflow_id as-is; submit_action_type=start_workflow will use it.
            payload_schema =
                jsonb_build_object(
                    'form_key', 'schedule_tour',
                    'required_fields', jsonb_build_array('tour_date', 'tour_time'),
                    'submit_action_type', 'start_workflow',
                    -- Optional "after" behavior (server supports it): update status_key if provided.
                    'after', jsonb_build_object('update_status_key', 'tour_scheduled'),
                    -- Workflow event payload passthrough container (server will merge form fields in).
                    'event_payload', jsonb_build_object('source', 'action_form', 'action_key', 'schedule_tour')
                )
        WHERE d.org_id = r.id
          AND d.key = 'schedule_tour'
          AND d.is_active = true
          AND d.workflow_id IS NOT NULL;
    END LOOP;
END $$;

