-- Schedule record: row-based overview layout (record_layouts.config_json.overview_rows)
UPDATE public.record_layouts
SET config_json =
    config_json
    || jsonb_build_object(
        'overview_rows',
        '[
            ["start_at", "assigned_vendor", "status"],
            ["customer_name", "phone", "email"],
            ["address"],
            ["service", "price"]
        ]'::jsonb
    )
WHERE entity_type = 'schedule'
  AND key = 'default';
