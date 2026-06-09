-- =============================================================================
-- Enrollment status matrix — default vocabulary + metadata (doctrine v1)
-- @see docs/sprints/06_2026/enrollment_lifecycle_status_matrix_contract.md
-- @see docs/sprints/06_2026/enrollment_status_seed_and_migration_plan.md
--
-- Rules:
-- - Upsert / metadata merge only — no DELETE, no status_key renames
-- - Do not deactivate legacy keys runtime still references
-- - Mark deprecated keys in metadata; add alias_of where applicable
-- - Demo record status values are not migrated (family reseed planned)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Person status — all orgs
-- -----------------------------------------------------------------------------

INSERT INTO public.status_definitions (
    org_id,
    entity_type,
    status_key,
    status_label,
    sort_order,
    is_active,
    is_system,
    industry_key,
    metadata
)
SELECT
    o.id,
    'persons'::text,
    v.status_key,
    v.status_label,
    v.sort_order,
    true,
    false,
    NULL::text,
    v.metadata
FROM public.orgs o
CROSS JOIN (
    VALUES
        (
            'active'::text,
            'Active'::text,
            10::int,
            jsonb_build_object(
                'alloy_layer', 'person_status',
                'applies_to_profiles', jsonb_build_array('child_lifecycle', 'person_generic'),
                'applies_to_roles', jsonb_build_array('child', 'parent', 'guardian', 'employee'),
                'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
            )
        ),
        (
            'inactive',
            'Inactive',
            60,
            jsonb_build_object(
                'alloy_layer', 'person_status',
                'applies_to_profiles', jsonb_build_array('child_lifecycle', 'person_generic'),
                'applies_to_roles', jsonb_build_array('child', 'parent', 'guardian', 'employee'),
                'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
            )
        ),
        (
            'archived',
            'Archived',
            70,
            jsonb_build_object(
                'alloy_layer', 'person_status',
                'applies_to_profiles', jsonb_build_array('child_lifecycle', 'person_generic'),
                'applies_to_roles', jsonb_build_array('child', 'parent', 'guardian', 'employee'),
                'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
            )
        ),
        (
            'withdrawn',
            'Withdrawn',
            40,
            jsonb_build_object(
                'alloy_layer', 'child_identity_status',
                'applies_to_profiles', jsonb_build_array('child_lifecycle'),
                'applies_to_roles', jsonb_build_array('child'),
                'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
            )
        ),
        (
            'graduated',
            'Graduated',
            50,
            jsonb_build_object(
                'alloy_layer', 'child_identity_status',
                'applies_to_profiles', jsonb_build_array('child_lifecycle'),
                'applies_to_roles', jsonb_build_array('child'),
                'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
            )
        ),
        (
            'future_start',
            'Future Start',
            20,
            jsonb_build_object(
                'alloy_layer', 'child_identity_status',
                'applies_to_profiles', jsonb_build_array('child_lifecycle'),
                'applies_to_roles', jsonb_build_array('child'),
                'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
            )
        )
) AS v(status_key, status_label, sort_order, metadata)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions sd
    WHERE sd.org_id = o.id
      AND sd.entity_type = 'persons'
      AND sd.status_key = v.status_key
);

UPDATE public.status_definitions sd
SET
    metadata = COALESCE(sd.metadata, '{}'::jsonb) || jsonb_build_object(
        'alloy_layer',
        CASE
            WHEN sd.status_key IN ('withdrawn', 'graduated', 'future_start') THEN 'child_identity_status'
            ELSE 'person_status'
        END,
        'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
    ),
    updated_at = now()
WHERE sd.entity_type = 'persons'
  AND sd.status_key IN (
      'active', 'inactive', 'archived', 'withdrawn', 'graduated', 'future_start'
  );

-- -----------------------------------------------------------------------------
-- 2) Case / opportunity container status — enrollment orgs
-- -----------------------------------------------------------------------------

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
case_statuses AS (
    SELECT *
    FROM (VALUES
        ('open'::text, 'Open'::text, 5::int),
        ('closed'::text, 'Closed'::text, 105::int),
        ('inactive'::text, 'Inactive'::text, 106::int),
        ('archived'::text, 'Archived'::text, 107::int)
    ) AS v(status_key, status_label, sort_order)
)
INSERT INTO public.status_definitions (
    org_id,
    entity_type,
    status_key,
    status_label,
    sort_order,
    is_active,
    is_system,
    industry_key,
    metadata
)
SELECT
    eo.org_id,
    'opportunities'::text,
    cs.status_key,
    cs.status_label,
    cs.sort_order,
    true,
    false,
    NULL::text,
    jsonb_build_object(
        'alloy_layer', 'case_status',
        'lifecycle_stage', 'case',
        'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
    )
FROM enrollment_orgs eo
CROSS JOIN case_statuses cs
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions sd
    WHERE sd.org_id = eo.org_id
      AND sd.entity_type = 'opportunities'
      AND sd.status_key = cs.status_key
);

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
)
UPDATE public.status_definitions sd
SET
    metadata = COALESCE(sd.metadata, '{}'::jsonb) || jsonb_build_object(
        'alloy_layer', 'case_status',
        'lifecycle_stage', 'case',
        'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
    ),
    updated_at = now()
FROM enrollment_orgs eo
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunities'
  AND sd.status_key IN ('open', 'closed', 'inactive', 'archived');

-- Legacy opportunity pipeline keys — retain for queue/runtime; mark layer + stage hint
WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
)
UPDATE public.status_definitions sd
SET
    metadata = COALESCE(sd.metadata, '{}'::jsonb) || jsonb_build_object(
        'alloy_layer', 'legacy_case_pipeline',
        'deprecated_for_new_config', true,
        'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
    ) || CASE sd.status_key
        WHEN 'new_inquiry' THEN jsonb_build_object('enrollment_operator_stage', 'lead')
        WHEN 'new' THEN jsonb_build_object('enrollment_operator_stage', 'lead')
        WHEN 'contact_attempted' THEN jsonb_build_object('enrollment_operator_stage', 'qualification')
        WHEN 'contacted' THEN jsonb_build_object('enrollment_operator_stage', 'qualification')
        WHEN 'qualification' THEN jsonb_build_object('enrollment_operator_stage', 'qualification')
        WHEN 'tour_scheduled' THEN jsonb_build_object('enrollment_operator_stage', 'tour')
        WHEN 'tour_completed' THEN jsonb_build_object('enrollment_operator_stage', 'tour')
        WHEN 'tour_no_show' THEN jsonb_build_object('enrollment_operator_stage', 'tour')
        WHEN 'follow_up_attempted' THEN jsonb_build_object('enrollment_operator_stage', 'tour')
        WHEN 'waitlisted' THEN jsonb_build_object('enrollment_operator_stage', 'waitlist')
        WHEN 'enrolling' THEN jsonb_build_object('enrollment_operator_stage', 'enrollment')
        WHEN 'ready_to_enroll' THEN jsonb_build_object('enrollment_operator_stage', 'enrollment')
        WHEN 'enrolled' THEN jsonb_build_object('enrollment_operator_stage', 'enrolled')
        WHEN 'lost' THEN jsonb_build_object('terminal', true, 'outcome_category', 'lost')
        ELSE '{}'::jsonb
    END,
    updated_at = now()
FROM enrollment_orgs eo
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunities'
  AND sd.status_key IN (
      'new_inquiry', 'new', 'contact_attempted', 'contacted', 'qualification',
      'tour_scheduled', 'tour_completed', 'tour_no_show', 'follow_up_attempted',
      'waitlisted', 'enrolling', 'ready_to_enroll', 'enrolled', 'lost'
  );

-- -----------------------------------------------------------------------------
-- 3) OCM enrollment dispositions — enrollment orgs
-- -----------------------------------------------------------------------------

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
ocm_dispositions AS (
    SELECT *
    FROM (VALUES
        -- lead
        ('new_inquiry'::text, 'New inquiry'::text, 5::int, 'lead'::text, true, false, NULL::text),
        -- qualification
        ('needs_qualification', 'Needs qualification', 8, 'qualification', true, false, NULL),
        ('qualified', 'Qualified', 9, 'qualification', true, false, NULL),
        -- tour
        ('tour_requested', 'Tour requested', 12, 'tour', true, false, NULL),
        ('tour_scheduled', 'Tour scheduled', 14, 'tour', true, false, NULL),
        ('tour_completed', 'Tour completed', 16, 'tour', true, false, NULL),
        ('decision_pending', 'Waiting for family decision', 18, 'tour', true, false, NULL),
        -- waitlist
        ('waitlisted', 'Waitlisted', 20, 'waitlist', true, false, NULL),
        ('waitlist_paused', 'Waitlist paused', 22, 'waitlist', true, false, NULL),
        -- enrolling
        ('offer_pending', 'Offer pending', 25, 'enrolling', true, false, NULL),
        ('registration_pending', 'Registration pending', 27, 'enrolling', true, false, NULL),
        ('paperwork_pending', 'Paperwork pending', 28, 'enrolling', true, false, NULL),
        ('start_date_scheduled', 'Start date scheduled', 29, 'enrolling', true, false, NULL),
        -- enrolled
        ('enrolled', 'Enrolled', 40, 'enrolled', true, false, 'success'),
        -- terminal / non-active
        ('not_a_fit', 'Not a fit', 55, 'qualification', false, true, 'lost'),
        ('not_moving_forward', 'Not moving forward', 56, 'lead', false, true, 'lost'),
        ('family_withdrew', 'Family withdrew', 57, 'tour', false, true, 'withdrawn'),
        ('deferred', 'Deferred', 58, 'lead', false, true, 'deferred'),
        ('not_enrolling', 'Not enrolling', 59, 'lead', false, true, 'lost'),
        ('aged_out', 'No longer eligible', 60, 'qualification', false, true, 'lost')
    ) AS v(status_key, status_label, sort_order, stage_key, active, terminal, outcome_category)
)
INSERT INTO public.status_definitions (
    org_id,
    entity_type,
    status_key,
    status_label,
    sort_order,
    is_active,
    is_system,
    industry_key,
    metadata
)
SELECT
    eo.org_id,
    'opportunity_customer_members'::text,
    d.status_key,
    d.status_label,
    d.sort_order,
    true,
    false,
    NULL::text,
    jsonb_build_object(
        'alloy_layer', 'enrollment_disposition',
        'entity_scope', 'enrollment_track',
        'stage_key', d.stage_key,
        'active', d.active,
        'terminal', d.terminal,
        'outcome_category', d.outcome_category,
        'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
    )
FROM enrollment_orgs eo
CROSS JOIN ocm_dispositions d
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions sd
    WHERE sd.org_id = eo.org_id
      AND sd.entity_type = 'opportunity_customer_members'
      AND sd.status_key = d.status_key
);

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
ocm_dispositions AS (
    SELECT *
    FROM (VALUES
        ('new_inquiry'::text, 'lead'::text, true, false, NULL::text),
        ('needs_qualification', 'qualification', true, false, NULL),
        ('qualified', 'qualification', true, false, NULL),
        ('tour_requested', 'tour', true, false, NULL),
        ('tour_scheduled', 'tour', true, false, NULL),
        ('tour_completed', 'tour', true, false, NULL),
        ('decision_pending', 'tour', true, false, NULL),
        ('waitlisted', 'waitlist', true, false, NULL),
        ('waitlist_paused', 'waitlist', true, false, NULL),
        ('offer_pending', 'enrolling', true, false, NULL),
        ('registration_pending', 'enrolling', true, false, NULL),
        ('paperwork_pending', 'enrolling', true, false, NULL),
        ('start_date_scheduled', 'enrolling', true, false, NULL),
        ('enrolled', 'enrolled', true, false, 'success'),
        ('not_a_fit', 'qualification', false, true, 'lost'),
        ('not_moving_forward', 'lead', false, true, 'lost'),
        ('family_withdrew', 'tour', false, true, 'withdrawn'),
        ('deferred', 'lead', false, true, 'deferred'),
        ('not_enrolling', 'lead', false, true, 'lost'),
        ('aged_out', 'qualification', false, true, 'lost')
    ) AS v(status_key, stage_key, active, terminal, outcome_category)
)
UPDATE public.status_definitions sd
SET
    metadata = COALESCE(sd.metadata, '{}'::jsonb) || jsonb_build_object(
        'alloy_layer', 'enrollment_disposition',
        'entity_scope', 'enrollment_track',
        'stage_key', d.stage_key,
        'active', d.active,
        'terminal', d.terminal,
        'outcome_category', d.outcome_category,
        'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
    ),
    updated_at = now()
FROM enrollment_orgs eo
JOIN ocm_dispositions d ON true
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunity_customer_members'
  AND sd.status_key = d.status_key;

-- -----------------------------------------------------------------------------
-- 4) OCM legacy keys — alias / deprecated (do not delete)
-- -----------------------------------------------------------------------------

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
)
UPDATE public.status_definitions sd
SET
    metadata = COALESCE(sd.metadata, '{}'::jsonb) || jsonb_build_object(
        'alias_of', 'new_inquiry',
        'deprecated', true,
        'alloy_layer', 'enrollment_disposition',
        'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
    ),
    updated_at = now()
FROM enrollment_orgs eo
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunity_customer_members'
  AND sd.status_key = 'interested';

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
)
UPDATE public.status_definitions sd
SET
    metadata = COALESCE(sd.metadata, '{}'::jsonb) || jsonb_build_object(
        'deprecated', true,
        'replacement_key', 'registration_pending',
        'alloy_layer', 'enrollment_disposition',
        'stage_key', 'enrolling',
        'active', true,
        'terminal', false,
        'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
    ),
    updated_at = now()
FROM enrollment_orgs eo
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunity_customer_members'
  AND sd.status_key = 'enrolling';

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
)
UPDATE public.status_definitions sd
SET
    metadata = COALESCE(sd.metadata, '{}'::jsonb) || jsonb_build_object(
        'deprecated', true,
        'alias_of', 'family_withdrew',
        'alloy_layer', 'enrollment_disposition',
        'stage_key', 'tour',
        'active', false,
        'terminal', true,
        'outcome_category', 'withdrawn',
        'seed_source', 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
    ),
    updated_at = now()
FROM enrollment_orgs eo
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunity_customer_members'
  AND sd.status_key = 'withdrawn';

-- -----------------------------------------------------------------------------
-- Verification (manual)
-- SELECT entity_type, status_key, metadata->>'alloy_layer', metadata->>'stage_key'
-- FROM status_definitions
-- WHERE metadata->>'seed_source' = 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
-- ORDER BY entity_type, sort_order;
