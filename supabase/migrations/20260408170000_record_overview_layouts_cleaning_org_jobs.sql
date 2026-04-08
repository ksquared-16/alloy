-- =============================================================================
-- Job record overview layout — Alloy Bend / cleaning staging org
-- =============================================================================
-- Org id matches public booking field seed (20260402143000): staging “Alloy Bend”.
-- Idempotent: INSERT … SELECT … WHERE EXISTS(org); ON CONFLICT DO UPDATE.
--
-- Verification:
--   SELECT id, template_key, is_active, config->'header_keys' AS header_keys
--   FROM public.record_overview_layouts
--   WHERE org_id = '7803388d-cdee-4afb-89cf-23a137f39423'
--     AND entity_type = 'jobs' AND surface = 'overview';
-- =============================================================================

INSERT INTO public.record_overview_layouts (
    org_id,
    entity_type,
    surface,
    template_key,
    config,
    is_active,
    updated_at
)
SELECT
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'jobs',
    'overview',
    'default_record_overview',
    $json$
{
  "header_keys": [
    "title",
    "_status_display",
    "job_number",
    "service_key",
    "service_frequency_key"
  ],
  "bands": [
    {
      "band_key": "summary",
      "enabled": true,
      "items": [
        { "kind": "field", "key": "_customer_name" },
        { "kind": "field", "key": "_primary_person_name" },
        { "kind": "field", "key": "scheduled_at" },
        { "kind": "field", "key": "_next_schedule" },
        { "kind": "field", "key": "_location_label" },
        { "kind": "field", "key": "_work_unit_label" },
        { "kind": "field", "key": "_opportunity_name" },
        { "kind": "field", "key": "_vendor_name" }
      ]
    },
    {
      "band_key": "service_property",
      "enabled": true,
      "items": [
        { "kind": "field", "key": "_service_home_type_label" },
        { "kind": "field", "key": "_service_sqft_band_label" },
        { "kind": "field", "key": "_service_bedrooms" },
        { "kind": "field", "key": "_service_bathrooms" }
      ]
    },
    {
      "band_key": "operational",
      "enabled": true,
      "items": [
        { "kind": "field", "key": "status_key" },
        { "kind": "field", "key": "scheduled_at" },
        { "kind": "field", "key": "completed_at" },
        { "kind": "field", "key": "_vendor_name" },
        { "kind": "field", "key": "_work_unit_label" }
      ]
    },
    {
      "band_key": "financial",
      "enabled": true,
      "items": [
        { "kind": "field", "key": "display_total_cents" },
        { "kind": "field", "key": "estimated_total_cents" },
        { "kind": "field", "key": "_discount_applied" },
        { "kind": "field", "key": "_discount_label" }
      ]
    }
  ],
  "relationship_group_keys": [
    "primary_customer_person",
    "customer_account"
  ]
}
$json$::jsonb,
    true,
    now()
WHERE EXISTS (
    SELECT 1 FROM public.orgs o WHERE o.id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
)
ON CONFLICT (org_id, entity_type, surface) DO UPDATE SET
    template_key = EXCLUDED.template_key,
    config = EXCLUDED.config,
    is_active = EXCLUDED.is_active,
    updated_at = now();
