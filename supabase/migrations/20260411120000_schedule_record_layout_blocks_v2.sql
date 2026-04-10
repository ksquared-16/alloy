-- Schedule record layout v2: structured layout_blocks (snapshot, secondary_summary, section_group).
-- Retains overview_rows for backward-compatible readers; UI prefers layout_blocks when version = 2.

UPDATE public.record_layouts
SET config_json =
    '{
  "version": 2,
  "overview_section_order": [
    "overview",
    "property_service",
    "job",
    "customer",
    "location",
    "vendor",
    "reschedule_history",
    "documents"
  ],
  "overview_rows": [
    ["start_at", "assigned_vendor", "status"],
    ["customer_name", "phone", "email"],
    ["address"],
    ["service", "price"]
  ],
  "layout_blocks": [
    {
      "type": "snapshot",
      "key": "visit_snapshot",
      "title": "Visit",
      "groups": [
        { "label": "When", "fields": ["start_at", "end_at"] },
        { "label": "Account & contact", "fields": ["customer_name", "phone", "email"] },
        { "label": "Where", "fields": ["address"] },
        { "label": "Assignment", "fields": ["assigned_vendor", "status"] }
      ]
    },
    {
      "type": "secondary_summary",
      "key": "service_price",
      "fields": ["service", "price"]
    },
    {
      "type": "section_group",
      "key": "details_stack",
      "sections": [
        "overview",
        "property_service",
        "job",
        "customer",
        "location",
        "vendor",
        "reschedule_history",
        "documents"
      ]
    }
  ]
}'::jsonb
WHERE entity_type = 'schedule'
  AND key = 'default';
