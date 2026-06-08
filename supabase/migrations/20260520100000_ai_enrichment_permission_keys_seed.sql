-- AI enrichment capability keys (Phase 2.5).
-- Seeds public.permissions + public.permission_keys + public.permission_definitions (dual FK for role_permission_grants).
-- Default grants: org `admin` role receives ai.enrichment.use only (conservative). Optional keys have no default grants.
-- No AI tables, proposal tables, telemetry tables, or provider config tables.
--
-- See: docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md (Phase 2.5 — staging grants & strict rollout).

-- ---------------------------------------------------------------------------
-- Required: invoke server-side AI enrichment (stub route today; live later)
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (key, group_key, label, is_active)
VALUES (
    'ai.enrichment.use',
    'ai',
    'Use AI enrichment',
    true
)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

INSERT INTO public.permission_keys (key, label, group_key, description, is_active)
VALUES (
    'ai.enrichment.use',
    'Use AI enrichment',
    'ai',
    'Call server-side AI enrichment features (org policy + env gates still apply).',
    true
)
ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label,
    group_key = EXCLUDED.group_key,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

INSERT INTO public.permission_definitions (key, group_key, label, is_active)
VALUES (
    'ai.enrichment.use',
    'ai',
    'Use AI enrichment',
    true
)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

-- ---------------------------------------------------------------------------
-- Optional / future: org-level provider & model allowlist (not wired in product UI yet)
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (key, group_key, label, is_active)
VALUES (
    'ai.provider.config.manage',
    'ai',
    'Manage AI provider configuration',
    true
)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

INSERT INTO public.permission_keys (key, label, group_key, description, is_active)
VALUES (
    'ai.provider.config.manage',
    'Manage AI provider configuration',
    'ai',
    'Future: edit org AI provider settings (no UI in this slice).',
    true
)
ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label,
    group_key = EXCLUDED.group_key,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

INSERT INTO public.permission_definitions (key, group_key, label, is_active)
VALUES (
    'ai.provider.config.manage',
    'ai',
    'Manage AI provider configuration',
    true
)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

-- ---------------------------------------------------------------------------
-- Optional / future: review AI usage telemetry dashboards (not wired yet)
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (key, group_key, label, is_active)
VALUES (
    'ai.telemetry.review',
    'ai',
    'Review AI usage telemetry',
    true
)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

INSERT INTO public.permission_keys (key, label, group_key, description, is_active)
VALUES (
    'ai.telemetry.review',
    'Review AI usage telemetry',
    'ai',
    'Future: read-only access to AI usage / audit views (no new tables in this migration).',
    true
)
ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label,
    group_key = EXCLUDED.group_key,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

INSERT INTO public.permission_definitions (key, group_key, label, is_active)
VALUES (
    'ai.telemetry.review',
    'ai',
    'Review AI usage telemetry',
    true
)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

-- Default grant: org admin role only (idempotent).
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT o.id, 'admin', 'ai.enrichment.use', true
FROM public.orgs AS o
WHERE NOT EXISTS (
    SELECT 1
    FROM public.role_permission_grants AS g
    WHERE g.org_id = o.id
      AND g.role_key = 'admin'
      AND g.permission_key = 'ai.enrichment.use'
);
