-- =============================================================================
-- Backfill: Batch 1 field_definitions (record-number system fields) for all orgs
-- =============================================================================
-- Context: 20260402103100_field_registry_batch1_field_definition_seeds.sql seeded
-- these rows only for orgs that existed at migrate time. Orgs created later can
-- legitimately have zero field_definitions for an entity — Settings > Fields then
-- appears empty for those types. This migration repeats the same INSERT shape so
-- every current org gets missing baseline rows without touching existing rows.
--
-- Scope: ONLY the seven known batch-1 keys (same VALUES as the original migration).
-- Does not add new field keys, alter API behavior, or update existing definitions.
--
-- Idempotency: ON CONFLICT (org_id, entity_type, field_key) DO NOTHING — safe to re-run.
-- Does not touch field_values.
-- =============================================================================

INSERT INTO "public"."field_definitions" (
    "org_id",
    "entity_type",
    "field_key",
    "label",
    "description",
    "field_type",
    "is_system",
    "is_required",
    "is_active",
    "is_visible_in_form",
    "is_visible_in_drawer",
    "is_visible_in_table",
    "is_filterable",
    "is_sortable",
    "section_key",
    "sort_order",
    "config"
)
SELECT
    o."id",
    v."entity_type",
    v."field_key",
    v."label",
    v."description",
    'number'::text,
    true,
    true,
    true,
    false,
    true,
    true,
    true,
    true,
    'identity'::text,
    5,
    '{}'::jsonb
FROM "public"."orgs" o
CROSS JOIN (
    VALUES
        ('customer'::text, 'customer_number'::text, 'Customer #'::text, 'Unique customer number within your organization.'::text),
        ('job'::text, 'job_number'::text, 'Job #'::text, 'Unique job number within your organization.'::text),
        ('opportunity'::text, 'opportunity_number'::text, 'Opportunity #'::text, 'Unique opportunity number within your organization.'::text),
        ('location'::text, 'location_number'::text, 'Location #'::text, 'Unique location number within your organization.'::text),
        ('person'::text, 'person_number'::text, 'Person #'::text, 'Unique person number within your organization.'::text),
        ('vendor'::text, 'vendor_number'::text, 'Vendor #'::text, 'Unique vendor number within your organization.'::text),
        ('schedule'::text, 'schedule_number'::text, 'Schedule #'::text, 'Unique schedule number within your organization.'::text)
) AS v ("entity_type", "field_key", "label", "description")
ON CONFLICT ("org_id", "entity_type", "field_key") DO NOTHING;
