-- Phase 2: enrollment queue row preview policy + Message / Ask BOS action definitions.
-- Idempotent.
--
-- action_definitions uniqueness: partial indexes ux_action_definitions_org_key (org_id, key)
-- and ux_action_definitions_global_key (key) WHERE org_id IS NULL — not ON CONFLICT (org_id, key).

-- 1) Normalize enrollment pipeline queue_definition row_preview.actions (strip call/email/message).
WITH pipeline_wus AS (
    SELECT wu.id
    FROM public.work_units wu
    JOIN public.departments d ON d.id = wu.department_id
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
      AND lower(coalesce(wu.key, '')) = 'enrollment_pipeline'
)
UPDATE public.work_units wu
SET
    queue_definition = jsonb_set(
        coalesce(wu.queue_definition, '{}'::jsonb),
        '{ui,row_preview,actions}',
        '["open"]'::jsonb,
        true
    ),
    updated_at = now()
WHERE wu.id IN (SELECT id FROM pipeline_wus)
  AND coalesce(wu.queue_definition #>> '{ui,row_preview,actions}', '') IS DISTINCT FROM '["open"]';

-- 2) Org-scoped action definitions: quick_message, ask_bos (enrollment orgs)
WITH orgs_active AS (
    SELECT DISTINCT d.org_id
    FROM public.departments d
    WHERE lower(coalesce(d.key, '')) = 'enrollment'
),
defs AS (
    SELECT *
    FROM (
        VALUES
            (
                'quick_message'::text,
                'Message'::text,
                'opportunity'::text,
                'ui_intent'::text,
                '{"intent":"quick_message"}'::jsonb
            ),
            (
                'ask_bos'::text,
                'Ask BOS'::text,
                'opportunity'::text,
                'ui_intent'::text,
                '{"intent":"ask_bos"}'::jsonb
            )
    ) AS v(key, label, entity_type, action_type, payload_schema)
),
inserted AS (
    INSERT INTO public.action_definitions (org_id, key, label, entity_type, action_type, payload_schema, is_active, priority)
    SELECT o.org_id, d.key, d.label, d.entity_type, d.action_type, d.payload_schema, true, 80
    FROM orgs_active o
    CROSS JOIN defs d
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.action_definitions x
        WHERE x.org_id = o.org_id
          AND x.key = d.key
    )
    RETURNING id
)
UPDATE public.action_definitions ad
SET
    label = d.label,
    entity_type = d.entity_type,
    action_type = d.action_type,
    payload_schema = d.payload_schema,
    is_active = true,
    updated_at = now()
FROM orgs_active o
CROSS JOIN defs d
WHERE ad.org_id = o.org_id
  AND ad.key = d.key;
