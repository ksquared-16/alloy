-- =============================================================================
-- Childcare: Opportunity / Inquiry drawer — workflow v3 (org-scoped)
-- =============================================================================
-- Replaces record_drawer_layouts.config_json for childcare orgs so the drawer
-- matches inquiry workflow v1 UI: children first, tuition placeholder, source
-- collapsed; enrollment + tour/follow-up live in header (not body sections).
-- =============================================================================

WITH childcare_orgs AS (
    SELECT o.id AS org_id
    FROM public.orgs o
    JOIN public.industries i ON i.id = o.industry_id
    WHERE i.key = 'childcare'
      AND COALESCE(i.is_active, true) = true
)
UPDATE public.record_drawer_layouts r
SET
    config_json = $cfg$
{
  "version": 3,
  "inquiry_drawer_mode": "workflow_v1",
  "suppress_body_status": true,
  "overview_section_order": [
    "inquiry_children",
    "inquiry_tuition",
    "inquiry_source_external"
  ],
  "overview_hidden_sections": [
    "identity",
    "opportunity",
    "relationships",
    "booking",
    "quote",
    "promo",
    "inquiry",
    "enrollment",
    "program",
    "source",
    "tour",
    "follow_up",
    "details",
    "specialty_quote",
    "opportunity_details",
    "customer_booking",
    "record_info",
    "notes",
    "status",
    "__unified_status",
    "pricing",
    "tuition",
    "tuition_pricing",
    "fee_schedule",
    "inquiry_enrollment",
    "inquiry_tour_followup"
  ],
  "inquiry_workflow_sections": [
    {
      "key": "inquiry_source_external",
      "title": "Source & external",
      "field_keys": [
        "inquiry_source",
        "source",
        "external_source",
        "external_id",
        "discount_code",
        "discount_program_id"
      ],
      "default_expanded": false
    }
  ]
}
$cfg$::jsonb,
    updated_at = now()
FROM childcare_orgs c
WHERE r.org_id = c.org_id
  AND r.entity_type = 'opportunity'
  AND r.surface = 'drawer'
  AND r.key = 'default'
  AND COALESCE(r.is_active, true) = true;
