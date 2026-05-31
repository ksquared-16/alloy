-- =============================================================================
-- Phase 3: Enrollment canonical action alignment (audit + safe activation)
-- =============================================================================
-- Activates registry keys that route to existing packet review, send form,
-- and inquiry-children placement field UI. Does NOT activate approve_enrollment
-- or reserve_spot (requirement gates / placement orchestration not unified).
-- Docs: docs/sprints/05_2026/enrollment_alignment_audit.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) review_enrollment_packet — ui_intent → existing packet review modal
-- ---------------------------------------------------------------------------

UPDATE public.action_definitions ad
SET
    action_type = 'ui_intent',
    is_active = true,
    priority = 80,
    description = 'Open enrollment packet review for pending submitted sessions.',
    payload_schema = jsonb_build_object(
        'intent', 'review_enrollment_packet',
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'review_enrollment_packet';

-- ---------------------------------------------------------------------------
-- 2) request_missing_information — ui_intent → send form composer (reuse)
-- ---------------------------------------------------------------------------

UPDATE public.action_definitions ad
SET
    action_type = 'ui_intent',
    is_active = true,
    priority = 81,
    description = 'Open send-form composer to request missing enrollment information.',
    payload_schema = jsonb_build_object(
        'intent', 'request_missing_information',
        'composer', 'send_form',
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'request_missing_information';

-- ---------------------------------------------------------------------------
-- 3) assign_classroom / assign_schedule / set_start_date — focus inquiry children
-- ---------------------------------------------------------------------------

UPDATE public.action_definitions ad
SET
    action_type = 'ui_intent',
    is_active = true,
    priority = v.priority,
    description = v.description,
    payload_schema = jsonb_build_object(
        'intent', ad.key,
        'focus_field', v.focus_field,
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
FROM (
    VALUES
        ('assign_classroom'::text, 83, 'program_room_cohort_key'::text, 'Focus inquiry children to assign classroom/program.'),
        ('assign_schedule', 84, 'desired_schedule_type', 'Focus inquiry children to set desired schedule.'),
        ('set_start_date', 85, 'desired_start_date', 'Focus inquiry children to set desired start date.')
) AS v(key, priority, focus_field, description)
WHERE ad.org_id IS NULL
  AND ad.key = v.key;

-- send_enrollment_packet catalog metadata (already active ui_intent)
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

-- approve_enrollment + reserve_spot remain inactive stubs (Phase 3b)
UPDATE public.action_definitions ad
SET
    payload_schema = jsonb_set(
        COALESCE(ad.payload_schema, '{}'::jsonb),
        '{catalog,implementation_status}',
        '"stub_phase3b"'::jsonb,
        true
    ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key IN ('approve_enrollment', 'reserve_spot')
  AND ad.is_active = false;

-- ---------------------------------------------------------------------------
-- 4) Placements (global templates; no broad reseed)
-- ---------------------------------------------------------------------------

WITH review_status AS (
    SELECT jsonb_build_array(
        'tour_completed', 'tour_no_show', 'follow_up_attempted', 'enrolling', 'waitlisted'
    ) AS keys
),
packet_status AS (
    SELECT jsonb_build_array(
        'tour_scheduled', 'tour_completed', 'tour_no_show', 'follow_up_attempted', 'enrolling', 'waitlisted'
    ) AS keys
),
placement_status AS (
    SELECT jsonb_build_array(
        'tour_completed', 'tour_no_show', 'follow_up_attempted', 'enrolling', 'waitlisted'
    ) AS keys
),
defs AS (
    SELECT ad.id, ad.key
    FROM public.action_definitions ad
    WHERE ad.org_id IS NULL
      AND ad.key IN (
          'review_enrollment_packet',
          'request_missing_information',
          'assign_classroom',
          'assign_schedule',
          'set_start_date'
      )
      AND ad.is_active = true
),
plan AS (
    SELECT d.id AS action_definition_id, d.key, v.surface, v.slot, v.section_key, v.order_index, v.display_style, v.scope
    FROM defs d
    JOIN (
        VALUES
            ('review_enrollment_packet'::text, 'record_header'::text, 'primary'::text, NULL::text, 80, 'button'::text, 'review'::text),
            ('request_missing_information', 'record_header', 'overflow', NULL, 81, 'menu_item', 'review'),
            ('assign_classroom', 'record_section', 'secondary', 'inquiry_children', 83, 'button', 'placement'),
            ('assign_schedule', 'record_section', 'secondary', 'inquiry_children', 84, 'button', 'placement'),
            ('set_start_date', 'record_section', 'secondary', 'inquiry_children', 85, 'button', 'placement')
    ) AS v(key, surface, slot, section_key, order_index, display_style, scope) ON v.key = d.key
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
    p.section_key,
    p.order_index,
    p.display_style,
    CASE
        WHEN p.scope = 'review' THEN jsonb_build_object('status_key_in', (SELECT keys FROM review_status))
        WHEN p.scope = 'placement' THEN jsonb_build_object('status_key_in', (SELECT keys FROM placement_status))
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
      AND ap.section_key IS NOT DISTINCT FROM p.section_key
);
