-- Staging / demo: add Workflow Assist propose feature when
-- `20260522180000_staging_demo_org_ai_policy_task_assist_draft.sql` already ran with only `task_assist_draft`.
--
-- Target org: childcare staging / demo (`93667019-bd28-49b5-a688-acc9bb1e0a19`).
--
-- Idempotent: unions `workflow_assist_draft` into `metadata.ai_policy.allowed_features` without removing
-- existing entries; preserves provider and other `ai_policy` keys (same merge pattern as 20260522180000).

UPDATE public.org_settings AS os
SET
    metadata = jsonb_set(
        COALESCE(os.metadata, '{}'::jsonb),
        '{ai_policy}',
        COALESCE(os.metadata->'ai_policy', '{}'::jsonb)
            || jsonb_build_object('enabled', true)
            || jsonb_build_object(
                'allowed_features',
                (
                    SELECT COALESCE(jsonb_agg(feat ORDER BY feat), '[]'::jsonb)
                    FROM (
                        SELECT DISTINCT feat
                        FROM (
                            SELECT jsonb_array_elements_text(
                                    CASE
                                        WHEN jsonb_typeof(
                                            COALESCE(os.metadata->'ai_policy'->'allowed_features', '[]'::jsonb)
                                        ) = 'array'
                                        THEN COALESCE(os.metadata->'ai_policy'->'allowed_features', '[]'::jsonb)
                                        ELSE '[]'::jsonb
                                    END
                                ) AS feat
                            UNION ALL
                            SELECT 'workflow_assist_draft'::text AS feat
                        ) AS merged
                    ) AS distinct_feats
                )
            )
            || CASE
                WHEN NULLIF(btrim(COALESCE(os.metadata->'ai_policy'->>'provider', '')), '') IS NOT NULL
                THEN '{}'::jsonb
                ELSE jsonb_build_object('provider', 'stub')
            END,
        true
    ),
    updated_at = now()
WHERE os.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid;
