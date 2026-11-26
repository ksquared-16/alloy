-- Staging / demo: enable Trust-governed participant conversation interpretation.
--
-- Target org: childcare staging / demo (`93667019-bd28-49b5-a688-acc9bb1e0a19`).
-- Directed by the Enrollment AI Conversation mission (Gate 1): append
-- `participant_conversation_interpretation` to `metadata.ai_policy.allowed_features`.
--
-- Before-state verified 2026-08-19 via GET /api/admin/org-settings:
--   enabled: true · provider: "openai" · pii_mode: "strict" · logging_mode: "minimal" ·
--   retention_mode: "none" · allowed_features: [draft_enrichment, operational_summary,
--   reasoning_paraphrase, task_assist_draft, workflow_assist_draft]
--
-- Idempotent: unions the one feature without removing existing entries; preserves provider and
-- every other `ai_policy` key (same merge pattern as 20260522180000 / 20260523170000). Unlike
-- those precedents this deliberately does NOT default a missing provider to 'stub' — the
-- participant authorization gate rejects stub, and this org's provider is already 'openai'.

UPDATE public.org_settings AS os
SET
    metadata = jsonb_set(
        COALESCE(os.metadata, '{}'::jsonb),
        '{ai_policy}',
        COALESCE(os.metadata->'ai_policy', '{}'::jsonb)
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
                            SELECT 'participant_conversation_interpretation'::text AS feat
                        ) AS merged
                    ) AS distinct_feats
                )
            ),
        true
    ),
    updated_at = now()
WHERE os.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid;
