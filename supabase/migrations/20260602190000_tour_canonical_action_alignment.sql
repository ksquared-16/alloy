-- =============================================================================
-- Tour canonical action alignment — wire registry to existing tour_bookings paths
-- =============================================================================
-- Docs: docs/sprints/05_2026/tour_implementation_alignment_audit.md
-- =============================================================================

-- Shared tour-stage visibility (pipeline tour substates + qualification for schedule)
-- Server-side booking state gates apply at execute time.

-- ---------------------------------------------------------------------------
-- 1) schedule_tour — open_form → OpportunityTourScheduleActionModal (slot path)
-- ---------------------------------------------------------------------------

UPDATE public.action_definitions ad
SET
    label = 'Schedule tour',
    description = 'Schedule a tour using slot booking when a site is set; legacy date/time fallback otherwise.',
    action_type = 'open_form',
    priority = 55,
    is_active = true,
    payload_schema = jsonb_build_object(
        'form_key', 'schedule_tour',
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'schedule_tour';

-- ---------------------------------------------------------------------------
-- 2) reschedule_tour — same modal; show when tour_date mirror exists
-- ---------------------------------------------------------------------------

UPDATE public.action_definitions ad
SET
    label = 'Reschedule tour',
    description = 'Reschedule an existing tour booking to a new slot.',
    action_type = 'open_form',
    priority = 56,
    is_active = true,
    payload_schema = jsonb_build_object(
        'form_key', 'schedule_tour',
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'reschedule_tour';

-- ---------------------------------------------------------------------------
-- 3) confirm_tour — execute via tour_bookings confirm API
-- ---------------------------------------------------------------------------

UPDATE public.action_definitions ad
SET
    label = 'Confirm tour',
    description = 'Confirm a pending-approval tour booking.',
    action_type = 'ui_intent',
    priority = 57,
    is_active = true,
    payload_schema = jsonb_build_object(
        'intent', 'confirm_tour',
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'confirm_tour';

-- ---------------------------------------------------------------------------
-- 4) record_tour_outcome — open_form → outcome modal → execute
-- ---------------------------------------------------------------------------

UPDATE public.action_definitions ad
SET
    label = 'Record tour outcome',
    description = 'Mark tour completed or no-show on the active booking.',
    action_type = 'open_form',
    priority = 58,
    is_active = true,
    payload_schema = jsonb_build_object(
        'form_key', 'record_tour_outcome',
        'required_fields', jsonb_build_array('outcome'),
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'record_tour_outcome';

-- send_enrollment_packet: already active ui_intent — catalog metadata only
UPDATE public.action_definitions ad
SET
    payload_schema = COALESCE(ad.payload_schema, '{}'::jsonb)
        || jsonb_build_object(
            'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
                || jsonb_build_object('implementation_status', 'existing')
        ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'send_enrollment_packet'
  AND ad.is_active = true;

-- ---------------------------------------------------------------------------
-- 5) Placements (global templates; org overrides remain)
-- ---------------------------------------------------------------------------

WITH tour_schedule_status AS (
    SELECT jsonb_build_array(
        'qualification',
        'contact_attempted',
        'new_inquiry',
        'waitlisted'
    ) AS keys
),
tour_active_status AS (
    SELECT jsonb_build_array(
        'tour_scheduled',
        'tour_completed',
        'tour_no_show',
        'follow_up_attempted'
    ) AS keys
),
tour_packet_status AS (
    SELECT jsonb_build_array(
        'tour_scheduled',
        'tour_completed',
        'tour_no_show',
        'follow_up_attempted',
        'enrolling',
        'waitlisted'
    ) AS keys
),
defs AS (
    SELECT ad.id, ad.key
    FROM public.action_definitions ad
    WHERE ad.org_id IS NULL
      AND ad.key IN ('schedule_tour', 'reschedule_tour', 'confirm_tour', 'record_tour_outcome', 'send_enrollment_packet')
      AND ad.is_active = true
),
plan AS (
    SELECT d.id AS action_definition_id, d.key, v.surface, v.slot, v.order_index, v.display_style, v.scope
    FROM defs d
    JOIN (
        VALUES
            ('schedule_tour'::text, 'record_header'::text, 'secondary'::text, 55, 'button'::text, 'schedule'::text),
            ('reschedule_tour', 'record_header', 'secondary', 56, 'button', 'reschedule'),
            ('confirm_tour', 'record_header', 'overflow', 57, 'menu_item', 'tour_active'),
            ('record_tour_outcome', 'record_header', 'overflow', 58, 'menu_item', 'tour_active'),
            ('send_enrollment_packet', 'record_header', 'secondary', 78, 'button', 'packet')
    ) AS v(key, surface, slot, order_index, display_style, scope) ON v.key = d.key
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
    CASE
        WHEN p.scope = 'schedule' THEN jsonb_build_object('status_key_in', (SELECT keys FROM tour_schedule_status))
        WHEN p.scope = 'reschedule' THEN jsonb_build_object('metadata_field_exists', 'tour_date')
        WHEN p.scope = 'tour_active' THEN jsonb_build_object('status_key_in', (SELECT keys FROM tour_active_status))
        WHEN p.scope = 'packet' THEN jsonb_build_object('status_key_in', (SELECT keys FROM tour_packet_status))
        ELSE '{}'::jsonb
    END,
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
