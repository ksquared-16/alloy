-- =============================================================================
-- Batch 1 — System field_definitions for native record-number columns
-- =============================================================================
-- Inserts one field_definition per (org, entity_type, field_key) for the seven
-- Batch 1 record-number fields. Uses ON CONFLICT DO NOTHING so existing rows
-- (including manual seeds or UI edits) are never updated or deleted.
--
-- Does not touch field_values.
--
-- Prerequisites: 20260402103000_field_registry_batch1_record_numbers.sql
--   (not a FK dependency, but aligns registry with real columns).
--
-- Idempotency:
--   • Re-run inserts no new rows when (org_id, entity_type, field_key) exists
--   • Relies on unique index ux_field_definitions_org_entity_key (or equivalent
--     uniqueness on those columns) for ON CONFLICT — verified compatible before apply.
--
-- ---------------------------------------------------------------------------
-- Validation (run after migrate)
-- ---------------------------------------------------------------------------
-- -- Expect each org to have 7 rows for the Batch 1 keys (unless you intentionally skipped orgs):
-- SELECT org_id, COUNT(*) AS batch1_defs
-- FROM public.field_definitions
-- WHERE field_key IN (
--   'customer_number', 'job_number', 'opportunity_number', 'location_number',
--   'person_number', 'vendor_number', 'schedule_number'
-- )
-- GROUP BY org_id
-- ORDER BY org_id;
--
-- -- Listing:
-- SELECT org_id, entity_type, field_key, is_system, is_required, section_key, sort_order
-- FROM public.field_definitions
-- WHERE field_key IN (
--   'customer_number', 'job_number', 'opportunity_number', 'location_number',
--   'person_number', 'vendor_number', 'schedule_number'
-- )
-- ORDER BY org_id, entity_type;

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
