-- =============================================================================
-- Lifecycle runtime alignment — action placement gating + deprecated cleanup
-- =============================================================================
-- Doctrine: approve_enrollment only on enrollment-stage statuses.
-- Hide legacy mark_won / qualify_opportunity / quick_message from default surfaces.
-- Docs: docs/sprints/06_2026/lifecycle_runtime_configuration_alignment_sprint.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) approve_enrollment — enrollment stage only (not qualification / new lead / tour-only)
-- ---------------------------------------------------------------------------

WITH enrollment_approve_status AS (
    SELECT jsonb_build_array(
        'enrolling',
        'ready_to_enroll',
        'waitlisted',
        'follow_up_attempted',
        'tour_completed',
        'tour_no_show'
    ) AS keys
)
UPDATE public.action_placements ap
SET
    condition_config = jsonb_build_object('status_key_in', (SELECT keys FROM enrollment_approve_status)),
    updated_at = now()
FROM public.action_definitions ad
WHERE ap.action_definition_id = ad.id
  AND ap.org_id IS NULL
  AND ad.org_id IS NULL
  AND ad.key = 'approve_enrollment'
  AND ad.is_active = true
  AND ap.surface = 'record_header'
  AND ap.entity_type = 'opportunity';

-- ---------------------------------------------------------------------------
-- 2) Deprecated lifecycle actions — deactivate definitions + placements
-- ---------------------------------------------------------------------------

UPDATE public.action_definitions ad
SET
    is_active = false,
    description = COALESCE(ad.description, '') || ' [Deprecated — use canonical lifecycle actions.]',
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key IN ('mark_won', 'qualify_opportunity', 'quick_message');

UPDATE public.action_placements ap
SET is_active = false, updated_at = now()
FROM public.action_definitions ad
WHERE ap.action_definition_id = ad.id
  AND ad.org_id IS NULL
  AND ad.key IN ('mark_won', 'qualify_opportunity', 'quick_message');
