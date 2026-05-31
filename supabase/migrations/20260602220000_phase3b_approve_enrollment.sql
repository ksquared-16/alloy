-- =============================================================================
-- Phase 3b: Activate approve_enrollment with requirement-gated update_status path
-- =============================================================================
-- Docs: docs/sprints/05_2026/enrollment_alignment_audit.md
-- reserve_spot remains inactive (placement orchestration execute path not unified).
-- Legacy mark_won retained until operators migrate to approve_enrollment.
-- =============================================================================

UPDATE public.action_definitions ad
SET
    action_type = 'update_status',
    is_active = true,
    priority = 82,
    description = 'Approve enrollment after placement, schedule, start date, and contact requirements.',
    payload_schema = jsonb_build_object(
        'status_key', 'enrolled',
        'catalog', COALESCE(ad.payload_schema->'catalog', '{}'::jsonb)
            || jsonb_build_object('implementation_status', 'existing')
    ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'approve_enrollment';

-- Document reserve_spot deferral (still inactive)
UPDATE public.action_definitions ad
SET
    description = 'Reserve enrollment spot — deferred until unified placement-candidate execute path (Phase 3b).',
    payload_schema = jsonb_set(
        COALESCE(ad.payload_schema, '{}'::jsonb),
        '{catalog,implementation_status}',
        '"stub_phase3b"'::jsonb,
        true
    ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'reserve_spot'
  AND ad.is_active = false;

WITH approval_status AS (
    SELECT jsonb_build_array(
        'ready_to_enroll', 'enrolling', 'waitlisted', 'follow_up_attempted', 'tour_completed'
    ) AS keys
),
approve_def AS (
    SELECT ad.id
    FROM public.action_definitions ad
    WHERE ad.org_id IS NULL
      AND ad.key = 'approve_enrollment'
      AND ad.is_active = true
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
    d.id,
    'record_header'::text,
    'overflow'::text,
    'opportunity'::text,
    NULL::uuid,
    NULL::uuid,
    NULL::text,
    82,
    'menu_item'::text,
    jsonb_build_object('status_key_in', (SELECT keys FROM approval_status)),
    true
FROM approve_def d
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_placements ap
    WHERE ap.org_id IS NULL
      AND ap.action_definition_id = d.id
      AND ap.surface = 'record_header'
      AND ap.slot = 'overflow'
      AND ap.entity_type = 'opportunity'
      AND ap.department_id IS NULL
      AND ap.work_unit_id IS NULL
      AND ap.section_key IS NULL
);
