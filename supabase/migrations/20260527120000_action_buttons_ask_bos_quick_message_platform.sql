-- Platform action definitions: Message + Ask BOS (all orgs; Settings compact chooser).
-- Idempotent. Org-scoped rows from 20260526153000 remain valid; platform rows fill gaps.
--
-- Use WHERE NOT EXISTS (org_id IS NOT DISTINCT FROM …): uniqueness is on partial indexes
-- ux_action_definitions_global_key (key WHERE org_id IS NULL), not ON CONFLICT (org_id, key).

INSERT INTO public.action_definitions (org_id, key, label, description, entity_type, action_type, priority, payload_schema, is_active)
SELECT v.org_id, v.key, v.label, v.description, v.entity_type, v.action_type, v.priority, v.payload_schema::jsonb, v.is_active
FROM (VALUES
    (
        NULL::uuid,
        'quick_message'::text,
        'Message'::text,
        'Open a message composer for the selected record.'::text,
        'opportunity'::text,
        'ui_intent'::text,
        75,
        '{"intent":"quick_message"}',
        true
    ),
    (
        NULL::uuid,
        'ask_bos'::text,
        'Ask BOS'::text,
        'Open BOS with this record context.'::text,
        'opportunity'::text,
        'ui_intent'::text,
        76,
        '{"intent":"ask_bos"}',
        true
    )
) AS v(org_id, key, label, description, entity_type, action_type, priority, payload_schema, is_active)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_definitions x
    WHERE x.key = v.key
      AND x.org_id IS NOT DISTINCT FROM v.org_id
);
