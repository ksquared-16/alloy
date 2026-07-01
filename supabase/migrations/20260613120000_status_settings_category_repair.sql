-- =============================================================================
-- Status settings category repair (idempotent)
-- Separates opportunity container status from enrollment process status.
-- Uses metadata.status_settings_category + alloy_layer — does not delete rows.
-- =============================================================================

-- 1. Opportunity container statuses → Lead / Case Statuses
UPDATE public.status_definitions sd
SET metadata = coalesce(sd.metadata, '{}'::jsonb)
    || jsonb_build_object(
        'alloy_layer', 'case_status',
        'status_settings_category', 'lead_statuses'
    ),
    updated_at = now()
WHERE sd.entity_type IN ('opportunities', 'opportunity')
  AND sd.status_key IN ('open', 'closed', 'inactive', 'archived')
  AND (
    sd.metadata IS NULL
    OR sd.metadata->>'status_settings_category' IS DISTINCT FROM 'lead_statuses'
    OR sd.metadata->>'alloy_layer' IS DISTINCT FROM 'case_status'
  );

-- 2. Family-track enrollment process statuses on opportunities → Enrollment Statuses
UPDATE public.status_definitions sd
SET metadata = coalesce(sd.metadata, '{}'::jsonb)
    || jsonb_build_object(
        'alloy_layer', 'enrollment_process',
        'status_settings_category', 'enrollment_statuses'
    ),
    updated_at = now()
WHERE sd.entity_type IN ('opportunities', 'opportunity')
  AND sd.status_key NOT IN ('open', 'closed', 'inactive', 'archived')
  AND (
    sd.metadata->>'alloy_layer' IN ('lead_pipeline', 'legacy_case_pipeline')
    OR sd.metadata->>'process_key' = 'enrollment'
    OR sd.metadata->>'process_stage_key' IS NOT NULL
    OR sd.metadata->>'stage_key' IS NOT NULL
    OR sd.metadata->>'track_key' = 'family_track'
  )
  AND (
    sd.metadata IS NULL
    OR sd.metadata->>'status_settings_category' IS DISTINCT FROM 'enrollment_statuses'
    OR sd.metadata->>'alloy_layer' IS DISTINCT FROM 'enrollment_process'
  );

-- 3. Child-track enrollment disposition on OCM → Enrollment Statuses
UPDATE public.status_definitions sd
SET metadata = coalesce(sd.metadata, '{}'::jsonb)
    || jsonb_build_object(
        'alloy_layer', 'enrollment_disposition',
        'status_settings_category', 'enrollment_statuses'
    ),
    updated_at = now()
WHERE sd.entity_type IN ('opportunity_customer_members', 'opportunity_customer_member')
  AND (
    sd.metadata IS NULL
    OR sd.metadata->>'status_settings_category' IS DISTINCT FROM 'enrollment_statuses'
    OR (
      sd.metadata->>'alloy_layer' IS NOT NULL
      AND sd.metadata->>'alloy_layer' IS DISTINCT FROM 'enrollment_disposition'
    )
  );

-- 4. People statuses → People Statuses category
UPDATE public.status_definitions sd
SET metadata = coalesce(sd.metadata, '{}'::jsonb)
    || jsonb_build_object('status_settings_category', 'person_statuses'),
    updated_at = now()
WHERE sd.entity_type = 'persons'
  AND (
    sd.metadata IS NULL
    OR sd.metadata->>'status_settings_category' IS DISTINCT FROM 'person_statuses'
  );

-- 5. Mark remaining unclassified opportunity rows without process metadata as container
UPDATE public.status_definitions sd
SET metadata = coalesce(sd.metadata, '{}'::jsonb)
    || jsonb_build_object(
        'alloy_layer', 'case_status',
        'status_settings_category', 'lead_statuses',
        'bp_picker_hidden', false
    ),
    updated_at = now()
WHERE sd.entity_type IN ('opportunities', 'opportunity')
  AND sd.metadata->>'status_settings_category' IS NULL
  AND sd.metadata->>'process_key' IS NULL
  AND sd.metadata->>'process_stage_key' IS NULL
  AND sd.metadata->>'stage_key' IS NULL;
