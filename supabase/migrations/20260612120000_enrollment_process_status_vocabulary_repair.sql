-- =============================================================================
-- Enrollment Business Process status vocabulary repair (idempotent)
-- Family track → opportunities (lead_pipeline)
-- Child track → opportunity_customer_members (enrollment_disposition)
-- Does not delete existing rows.
-- =============================================================================

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
family_vocab AS (
    SELECT *
    FROM (VALUES
        ('new_inquiry'::text, 'New Lead'::text, 5::int, 'lead'::text),
        ('needs_qualification', 'Contacting', 10, 'lead'),
        ('qualified', 'Qualified', 15, 'qualification'),
        ('tour_requested', 'Tour Requested', 20, 'tour'),
        ('tour_scheduled', 'Tour Scheduled', 25, 'tour'),
        ('tour_completed', 'Tour Completed', 30, 'tour'),
        ('decision_pending', 'Decision Pending', 35, 'decision'),
        ('lost', 'Lost', 50, 'closed'),
        ('withdrawn', 'Withdrawn', 55, 'closed'),
        ('not_a_fit', 'Not a Fit', 60, 'closed'),
        ('aged_out', 'No Longer Eligible', 65, 'closed'),
        ('not_enrolling', 'Closed', 70, 'closed')
    ) AS v(status_key, status_label, sort_order, stage_key)
),
child_vocab AS (
    SELECT *
    FROM (VALUES
        ('waitlisted'::text, 'Waitlisted'::text, 20::int, 'waitlist'::text),
        ('offer_pending', 'Offer Pending', 22, 'waitlist'),
        ('waitlist_paused', 'Waitlist Paused', 24, 'waitlist'),
        ('enrolling', 'Enrolling', 30, 'enrolling'),
        ('registration_pending', 'Registration Pending', 32, 'enrolling'),
        ('paperwork_pending', 'Documents Pending', 34, 'enrolling'),
        ('start_date_scheduled', 'Future Start', 36, 'enrolling'),
        ('enrolled', 'Enrolled', 40, 'enrolled'),
        ('withdrawn', 'Withdrawn', 50, 'closed_withdrawn'),
        ('family_withdrew', 'Family Withdrew', 52, 'closed_withdrawn'),
        ('not_moving_forward', 'Not Moving Forward', 54, 'closed_withdrawn'),
        ('aged_out', 'No Longer Eligible', 56, 'closed_withdrawn'),
        ('not_enrolling', 'Closed', 58, 'closed_withdrawn')
    ) AS v(status_key, status_label, sort_order, stage_key)
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
    fv.status_key,
    fv.status_label,
    fv.sort_order,
    true,
    false,
    NULL::text,
    jsonb_build_object(
        'alloy_layer', 'lead_pipeline',
        'process_key', 'enrollment',
        'track_key', 'family_track',
        'stage_key', fv.stage_key,
        'process_stage_key', fv.stage_key,
        'entity_scope', 'family_case',
        'active', true,
        'seed_source', 'migration_20260612120000_enrollment_process_status_vocabulary_repair'
    )
FROM enrollment_orgs eo
CROSS JOIN family_vocab fv
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions sd
    WHERE sd.org_id = eo.org_id
      AND sd.entity_type = 'opportunities'
      AND sd.status_key = fv.status_key
);

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
child_vocab AS (
    SELECT *
    FROM (VALUES
        ('waitlisted'::text, 'Waitlisted'::text, 20::int, 'waitlist'::text),
        ('offer_pending', 'Offer Pending', 22, 'waitlist'),
        ('waitlist_paused', 'Waitlist Paused', 24, 'waitlist'),
        ('enrolling', 'Enrolling', 30, 'enrolling'),
        ('registration_pending', 'Registration Pending', 32, 'enrolling'),
        ('paperwork_pending', 'Documents Pending', 34, 'enrolling'),
        ('start_date_scheduled', 'Future Start', 36, 'enrolling'),
        ('enrolled', 'Enrolled', 40, 'enrolled'),
        ('withdrawn', 'Withdrawn', 50, 'closed_withdrawn'),
        ('family_withdrew', 'Family Withdrew', 52, 'closed_withdrawn'),
        ('not_moving_forward', 'Not Moving Forward', 54, 'closed_withdrawn'),
        ('aged_out', 'No Longer Eligible', 56, 'closed_withdrawn'),
        ('not_enrolling', 'Closed', 58, 'closed_withdrawn')
    ) AS v(status_key, status_label, sort_order, stage_key)
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
    cv.status_key,
    cv.status_label,
    cv.sort_order,
    true,
    false,
    NULL::text,
    jsonb_build_object(
        'alloy_layer', 'enrollment_disposition',
        'process_key', 'enrollment',
        'track_key', 'child_track',
        'stage_key', cv.stage_key,
        'process_stage_key', cv.stage_key,
        'entity_scope', 'enrollment_track',
        'active', true,
        'seed_source', 'migration_20260612120000_enrollment_process_status_vocabulary_repair'
    )
FROM enrollment_orgs eo
CROSS JOIN child_vocab cv
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions sd
    WHERE sd.org_id = eo.org_id
      AND sd.entity_type = 'opportunity_customer_members'
      AND sd.status_key = cv.status_key
);

-- Merge vocabulary metadata + labels on existing rows (enrollment orgs)
WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
family_vocab AS (
    SELECT *
    FROM (VALUES
        ('new_inquiry'::text, 'New Lead'::text, 5::int, 'lead'::text),
        ('needs_qualification', 'Contacting', 10, 'lead'),
        ('qualified', 'Qualified', 15, 'qualification'),
        ('tour_requested', 'Tour Requested', 20, 'tour'),
        ('tour_scheduled', 'Tour Scheduled', 25, 'tour'),
        ('tour_completed', 'Tour Completed', 30, 'tour'),
        ('decision_pending', 'Decision Pending', 35, 'decision'),
        ('lost', 'Lost', 50, 'closed'),
        ('withdrawn', 'Withdrawn', 55, 'closed'),
        ('not_a_fit', 'Not a Fit', 60, 'closed'),
        ('aged_out', 'No Longer Eligible', 65, 'closed'),
        ('not_enrolling', 'Closed', 70, 'closed')
    ) AS v(status_key, status_label, sort_order, stage_key)
)
UPDATE public.status_definitions sd
SET
    status_label = fv.status_label,
    sort_order = fv.sort_order,
    is_active = true,
    metadata = COALESCE(sd.metadata, '{}'::jsonb) || jsonb_build_object(
        'alloy_layer', 'lead_pipeline',
        'process_key', 'enrollment',
        'track_key', 'family_track',
        'stage_key', fv.stage_key,
        'process_stage_key', fv.stage_key,
        'entity_scope', 'family_case',
        'active', true,
        'seed_source', 'migration_20260612120000_enrollment_process_status_vocabulary_repair'
    ),
    updated_at = now()
FROM enrollment_orgs eo
JOIN family_vocab fv ON true
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunities'
  AND sd.status_key = fv.status_key;

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
child_vocab AS (
    SELECT *
    FROM (VALUES
        ('waitlisted'::text, 'Waitlisted'::text, 20::int, 'waitlist'::text),
        ('offer_pending', 'Offer Pending', 22, 'waitlist'),
        ('waitlist_paused', 'Waitlist Paused', 24, 'waitlist'),
        ('enrolling', 'Enrolling', 30, 'enrolling'),
        ('registration_pending', 'Registration Pending', 32, 'enrolling'),
        ('paperwork_pending', 'Documents Pending', 34, 'enrolling'),
        ('start_date_scheduled', 'Future Start', 36, 'enrolling'),
        ('enrolled', 'Enrolled', 40, 'enrolled'),
        ('withdrawn', 'Withdrawn', 50, 'closed_withdrawn'),
        ('family_withdrew', 'Family Withdrew', 52, 'closed_withdrawn'),
        ('not_moving_forward', 'Not Moving Forward', 54, 'closed_withdrawn'),
        ('aged_out', 'No Longer Eligible', 56, 'closed_withdrawn'),
        ('not_enrolling', 'Closed', 58, 'closed_withdrawn')
    ) AS v(status_key, status_label, sort_order, stage_key)
)
UPDATE public.status_definitions sd
SET
    status_label = fv.status_label,
    sort_order = fv.sort_order,
    is_active = true,
    metadata = COALESCE(sd.metadata, '{}'::jsonb) || jsonb_build_object(
        'alloy_layer', 'enrollment_disposition',
        'process_key', 'enrollment',
        'track_key', 'child_track',
        'stage_key', fv.stage_key,
        'process_stage_key', fv.stage_key,
        'entity_scope', 'enrollment_track',
        'active', true,
        'seed_source', 'migration_20260612120000_enrollment_process_status_vocabulary_repair'
    ),
    updated_at = now()
FROM enrollment_orgs eo
JOIN child_vocab fv ON true
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunity_customer_members'
  AND sd.status_key = fv.status_key;

-- Mark generic opportunity container statuses as excluded from enrollment stage pickers
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
        'excluded_from_enrollment_stage_picker', true,
        'seed_source', 'migration_20260612120000_enrollment_process_status_vocabulary_repair'
    ),
    updated_at = now()
FROM enrollment_orgs eo
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunities'
  AND sd.status_key IN ('open', 'closed', 'inactive', 'archived')
  AND COALESCE(sd.metadata->>'alloy_layer', 'case_status') = 'case_status';
