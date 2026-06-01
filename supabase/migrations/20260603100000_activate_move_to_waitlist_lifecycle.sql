-- =============================================================================
-- Lifecycle runtime alignment — activate move_to_waitlist (canonical waitlist transition)
-- =============================================================================
-- Replaces inactive catalog stub + retires add_to_waitlist_placeholder for enrollment orgs.
-- Docs: docs/sprints/06_2026/lifecycle_runtime_configuration_alignment_sprint.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Activate global definition (update_status execute path)
-- ---------------------------------------------------------------------------

UPDATE public.action_definitions ad
SET
    label = 'Move to waitlist',
    description = 'Move family to waitlist after child and program fit are captured.',
    action_type = 'update_status',
    priority = 56,
    is_active = true,
    payload_schema = jsonb_build_object(
        'status_key', 'waitlisted',
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'move_to_waitlist';

-- ---------------------------------------------------------------------------
-- 2) Retire legacy placeholder (org-scoped enrollment MVP)
-- ---------------------------------------------------------------------------

UPDATE public.action_definitions ad
SET
    is_active = false,
    description = 'Retired — use Move to waitlist (canonical).',
    updated_at = now()
WHERE ad.key = 'add_to_waitlist_placeholder';

UPDATE public.action_placements ap
SET is_active = false, updated_at = now()
FROM public.action_definitions ad
WHERE ap.action_definition_id = ad.id
  AND ad.key = 'add_to_waitlist_placeholder';

-- ---------------------------------------------------------------------------
-- 3) Placements — qualification, tour, enrollment (not lead / not already waitlisted)
-- ---------------------------------------------------------------------------

WITH waitlist_from_status AS (
    SELECT jsonb_build_array(
        'qualification',
        'contact_attempted',
        'contacted',
        'tour_scheduled',
        'tour_completed',
        'tour_no_show',
        'follow_up_attempted',
        'enrolling',
        'ready_to_enroll'
    ) AS keys
),
waitlist_def AS (
    SELECT ad.id
    FROM public.action_definitions ad
    WHERE ad.org_id IS NULL
      AND ad.key = 'move_to_waitlist'
      AND ad.is_active = true
),
plan AS (
    SELECT d.id AS action_definition_id, v.surface, v.slot, v.order_index, v.display_style
    FROM waitlist_def d
    JOIN (
        VALUES
            ('record_header'::text, 'secondary'::text, 56, 'button'::text),
            ('record_header'::text, 'overflow'::text, 56, 'menu_item'::text)
    ) AS v(surface, slot, order_index, display_style) ON true
)
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
    condition_config,
    is_active
)
SELECT
    NULL::uuid,
    p.action_definition_id,
    p.surface,
    p.slot,
    'opportunity'::text,
    NULL::uuid,
    NULL::uuid,
    NULL::text,
    p.order_index,
    p.display_style,
    jsonb_build_object('status_key_in', (SELECT keys FROM waitlist_from_status)),
    true
FROM plan p
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_placements ap
    WHERE ap.org_id IS NULL
      AND ap.action_definition_id = p.action_definition_id
      AND ap.surface = p.surface
      AND ap.slot = p.slot
      AND ap.entity_type = 'opportunity'
      AND ap.department_id IS NULL
      AND ap.work_unit_id IS NULL
      AND ap.section_key IS NULL
);
