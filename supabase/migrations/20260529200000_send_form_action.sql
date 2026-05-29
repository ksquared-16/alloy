-- Platform action: Send form (Opportunity drawer header via Settings placements).
-- Idempotent — partial unique index on global key (org_id IS NULL).

INSERT INTO public.action_definitions (org_id, key, label, description, entity_type, action_type, priority, payload_schema, is_active)
SELECT v.org_id, v.key, v.label, v.description, v.entity_type, v.action_type, v.priority, v.payload_schema::jsonb, v.is_active
FROM (VALUES
    (
        NULL::uuid,
        'send_form'::text,
        'Send form'::text,
        'Open the send-form composer for this family.'::text,
        'opportunity'::text,
        'ui_intent'::text,
        77,
        '{"intent":"send_form"}',
        true
    )
) AS v(org_id, key, label, description, entity_type, action_type, priority, payload_schema, is_active)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_definitions x
    WHERE x.key = v.key
      AND x.org_id IS NOT DISTINCT FROM v.org_id
);
