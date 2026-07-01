-- =============================================================================
-- Child lifecycle convergence — opportunity case status definitions (Card 5)
-- entity_type = opportunities
--
-- Add broad case keys; do NOT deactivate legacy pipeline statuses.
-- Target: orgs with enrollment department.
-- =============================================================================

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
case_statuses AS (
    SELECT *
    FROM (VALUES
        ('open'::text, 'Open'::text, 5::int, 'case'::text),
        ('closed'::text, 'Closed'::text, 105::int, 'case'::text),
        ('inactive'::text, 'Inactive'::text, 106::int, 'case'::text),
        ('archived'::text, 'Archived'::text, 107::int, 'case'::text)
    ) AS v(status_key, status_label, sort_order, lifecycle_stage)
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
        'lifecycle_stage', cs.lifecycle_stage,
        'seed_source', 'migration_20260601110000_opportunity_case_status_definitions_v2'
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

-- Metadata note on ready_to_enroll (deprecated → child offer_pending; row retained)
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
        'child_lifecycle_replacement', 'offer_pending',
        'seed_source', 'migration_20260601110000_opportunity_case_status_definitions_v2'
    ),
    updated_at = now()
FROM enrollment_orgs eo
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunities'
  AND sd.status_key = 'ready_to_enroll';

-- -----------------------------------------------------------------------------
-- Verification (manual)
-- SELECT org_id, status_key, is_active, metadata
-- FROM public.status_definitions
-- WHERE entity_type = 'opportunities'
--   AND status_key IN ('open','closed','inactive','archived','ready_to_enroll')
-- ORDER BY org_id, sort_order;
