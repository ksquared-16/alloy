-- Staging / demo enablement: Task Assist V1.1 deterministic propose (`task_assist_draft`) +
-- Workflow Assist Cards 4–5 deterministic propose (`workflow_assist_draft`).
--
-- Target org: childcare staging / demo tenant used elsewhere in repo seeds
-- (`93667019-bd28-49b5-a688-acc9bb1e0a19` — see e.g. `20260501200000_seed_staging_communication_provider_bindings.sql`).
--
-- Behavior (idempotent):
-- - Updates `public.org_settings` **only when a row already exists** for this `org_id` (no INSERT — avoids
--   inventing payout defaults or partial rows if settings were never created).
-- - Deep-merges `metadata.ai_policy` without removing sibling keys under `metadata` or under `ai_policy`.
-- - Sets `ai_policy.enabled = true`.
-- - Unions `task_assist_draft` and `workflow_assist_draft` into `ai_policy.allowed_features` (preserves all existing feature strings).
-- - Sets `ai_policy.provider = 'stub'` **only when** `provider` is missing, null, or blank — otherwise preserves
--   the existing provider (e.g. `openai` pilot orgs are not forced to stub by this migration).
-- - Does not touch `pii_mode`, `logging_mode`, `retention_mode`, or other `ai_policy` keys except those above.
--
-- Runtime (unchanged): stub Task Assist / Workflow Assist propose still requires `AI_ENRICHMENT_STUB_ENABLED=true` on the web
-- deployment when `provider` is `stub` — see `web/app/api/admin/ai/task-assist/propose/route.ts`,
-- `web/app/api/admin/ai/workflow-assist/propose/route.ts`, and `docs/product/ai-system.md`.

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
                            SELECT 'task_assist_draft'::text AS feat
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
