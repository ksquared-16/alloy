-- =============================================================================
-- Deprecate legacy enrollment status-slice work units (Card 5)
-- Additive: is_active = false + metadata pointers; do NOT delete rows.
-- Reassign opportunities still on legacy WUs → enrollment_pipeline per org.
-- =============================================================================

WITH enrollment_depts AS (
    SELECT d.id AS department_id, d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
canonical_wu AS (
    SELECT wu.id AS work_unit_id, wu.org_id, wu.department_id
    FROM public.work_units wu
    JOIN enrollment_depts ed ON ed.department_id = wu.department_id
    WHERE lower(coalesce(wu.key, '')) = 'enrollment_pipeline'
),
legacy_keys AS (
    SELECT unnest(
        ARRAY[
            'pipeline_overview'::text,
            'early_inquiries',
            'quoting',
            'priced_followup',
            'needs_attention'
        ]
    ) AS wu_key
),
legacy_wus AS (
    SELECT wu.id AS work_unit_id, wu.org_id, wu.department_id, wu.key AS wu_key
    FROM public.work_units wu
    JOIN enrollment_depts ed ON ed.department_id = wu.department_id
    JOIN legacy_keys lk ON lower(coalesce(wu.key, '')) = lk.wu_key
),
legacy_domain_map AS (
    SELECT *
    FROM (VALUES
        ('pipeline_overview'::text, NULL::text),
        ('early_inquiries', 'new_leads'),
        ('quoting', 'tours'),
        ('priced_followup', 'waitlist'),
        ('needs_attention', 'needs_attention')
    ) AS m(wu_key, replacement_domain)
)
UPDATE public.work_units wu
SET
    is_active = false,
    metadata = coalesce(wu.metadata, '{}'::jsonb) || jsonb_build_object(
        'deprecated', true,
        'replacement_work_unit_key', 'enrollment_pipeline',
        'replacement_domain', ldm.replacement_domain,
        'convergence_v2_deprecated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'legacy_queue_key_map', jsonb_build_object(
            'early_inquiries', 'new_leads',
            'quoting', 'tours',
            'priced_followup', 'waitlist'
        )
    ),
    updated_at = now()
FROM legacy_wus lw
LEFT JOIN legacy_domain_map ldm ON ldm.wu_key = lw.wu_key
WHERE wu.id = lw.work_unit_id
  AND wu.is_active = true;

-- Reassign opportunities on inactive legacy WUs to canonical enrollment_pipeline
WITH enrollment_depts AS (
    SELECT d.id AS department_id, d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
canonical_wu AS (
    SELECT wu.id AS work_unit_id, wu.org_id, wu.department_id
    FROM public.work_units wu
    JOIN enrollment_depts ed ON ed.department_id = wu.department_id
    WHERE lower(coalesce(wu.key, '')) = 'enrollment_pipeline'
),
legacy_keys AS (
    SELECT unnest(
        ARRAY[
            'pipeline_overview'::text,
            'early_inquiries',
            'quoting',
            'priced_followup',
            'needs_attention'
        ]
    ) AS wu_key
),
legacy_wus AS (
    SELECT wu.id AS work_unit_id, wu.org_id, wu.department_id, wu.key AS wu_key
    FROM public.work_units wu
    JOIN enrollment_depts ed ON ed.department_id = wu.department_id
    JOIN legacy_keys lk ON lower(coalesce(wu.key, '')) = lk.wu_key
)
UPDATE public.opportunities o
SET
    work_unit_id = cw.work_unit_id,
    updated_at = now()
FROM legacy_wus lw
JOIN canonical_wu cw ON cw.org_id = lw.org_id AND cw.department_id = lw.department_id
WHERE o.work_unit_id = lw.work_unit_id
  AND o.org_id = lw.org_id;

-- -----------------------------------------------------------------------------
-- Verification (manual)
-- SELECT wu.org_id, wu.key, wu.is_active, wu.metadata->>'deprecated' AS deprecated,
--        wu.metadata->>'replacement_work_unit_key' AS replacement
-- FROM public.work_units wu
-- JOIN public.departments d ON d.id = wu.department_id
-- WHERE lower(d.key) = 'enrollment'
--   AND lower(wu.key) IN ('pipeline_overview','early_inquiries','quoting','priced_followup','needs_attention','enrollment_pipeline')
-- ORDER BY wu.org_id, wu.key;
