-- =============================================================================
-- Child lifecycle convergence — OCM status definitions (Card 5)
-- entity_type = opportunity_customer_members
--
-- Additive only: retain existing keys; seed new lifecycle keys; metadata-alias interested.
-- Target: orgs with enrollment department.
-- =============================================================================

WITH enrollment_orgs AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND d.org_id IS NOT NULL
),
new_statuses AS (
    SELECT *
    FROM (VALUES
        ('new_inquiry'::text, 'New inquiry'::text, 5::int),
        ('tour_requested'::text, 'Tour requested'::text, 12::int),
        ('tour_scheduled'::text, 'Tour scheduled'::text, 14::int),
        ('tour_completed'::text, 'Tour completed'::text, 16::int),
        ('offer_pending'::text, 'Offer pending'::text, 25::int),
        ('withdrawn'::text, 'Withdrawn'::text, 55::int)
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
    'opportunity_customer_members'::text,
    ns.status_key,
    ns.status_label,
    ns.sort_order,
    true,
    false,
    NULL::text,
    jsonb_build_object(
        'seed_source', 'migration_20260601100000_child_lifecycle_status_definitions_v2'
    )
FROM enrollment_orgs eo
CROSS JOIN new_statuses ns
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions sd
    WHERE sd.org_id = eo.org_id
      AND sd.entity_type = 'opportunity_customer_members'
      AND sd.status_key = ns.status_key
);

-- Metadata-alias interested → new_inquiry (do not delete interested row)
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
        'seed_source', 'migration_20260601100000_child_lifecycle_status_definitions_v2'
    ),
    updated_at = now()
FROM enrollment_orgs eo
WHERE sd.org_id = eo.org_id
  AND sd.entity_type = 'opportunity_customer_members'
  AND sd.status_key = 'interested';

-- -----------------------------------------------------------------------------
-- Verification (manual)
-- SELECT org_id, status_key, status_label, is_active, metadata->>'alias_of' AS alias_of
-- FROM public.status_definitions
-- WHERE entity_type = 'opportunity_customer_members'
--   AND org_id IN (SELECT org_id FROM public.departments WHERE lower(key) = 'enrollment')
-- ORDER BY org_id, sort_order;
