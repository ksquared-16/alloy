-- =============================================================================
-- Enrollment status transition action (replaces case-only Update Status for enrollment)
-- =============================================================================
-- Seeds update_enrollment_status and aligns legacy update_status_add_note placements.
-- =============================================================================

INSERT INTO public.action_definitions (
    org_id,
    key,
    label,
    description,
    entity_type,
    action_type,
    priority,
    payload_schema,
    is_active
)
SELECT
    NULL::uuid,
    'update_enrollment_status',
    'Change Enrollment Status',
    'Move a child enrollment track (or household when no children) to a configured destination stage.',
    'opportunity',
    'open_form',
    35,
    jsonb_build_object(
        'form_key', 'update_enrollment_status',
        'intent', 'enrollment_status_transition',
        'confirmation_required', true,
        'catalog', jsonb_build_object(
            'executor', 'enrollment_status_transition',
            'input_schema', 'enrollment_status_wizard',
            'implementation_status', 'existing'
        )
    ),
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.action_definitions ad
    WHERE ad.org_id IS NULL AND ad.key = 'update_enrollment_status'
);

UPDATE public.action_definitions ad
SET
    label = 'Change Enrollment Status',
    description = 'Legacy placement key — routes to Change Enrollment Status (OCM-scoped).',
    payload_schema = jsonb_build_object(
        'form_key', 'update_enrollment_status',
        'legacy_alias_of', 'update_enrollment_status',
        'intent', 'enrollment_status_transition',
        'confirmation_required', true
    ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'update_status_add_note';

-- Mirror legacy queue_row / work_unit placements to canonical key where missing.
INSERT INTO public.action_placements (
    org_id,
    action_definition_id,
    surface,
    slot,
    priority,
    condition_config,
    is_active
)
SELECT
    ap.org_id,
    canonical.id,
    ap.surface,
    ap.slot,
    ap.priority,
    ap.condition_config,
    ap.is_active
FROM public.action_placements ap
JOIN public.action_definitions legacy ON legacy.id = ap.action_definition_id AND legacy.key = 'update_status_add_note'
JOIN public.action_definitions canonical ON canonical.key = 'update_enrollment_status'
    AND ((canonical.org_id IS NULL AND ap.org_id IS NULL) OR canonical.org_id = ap.org_id)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_placements existing
    WHERE existing.action_definition_id = canonical.id
      AND existing.surface = ap.surface
      AND existing.slot = ap.slot
      AND ((existing.org_id IS NULL AND ap.org_id IS NULL) OR existing.org_id = ap.org_id)
);
