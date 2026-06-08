-- Configuration / Layout Assist — Card 7: permission catalog + default admin grants.

INSERT INTO public.permissions (key, group_key, label, is_active)
VALUES
    ('config_assist.generate', 'config', 'Generate config/layout proposals', true),
    ('config_assist.review', 'config', 'Review config/layout proposals', true),
    ('config_assist.apply', 'config', 'Apply approved config/layout proposals', true),
    ('fields.manage', 'fields', 'Manage field definitions', true),
    ('fields.requirements.manage', 'fields', 'Manage field requirement policies', true),
    ('fields.editability.manage', 'fields', 'Manage field editability policies', true),
    ('sections.manage', 'sections', 'Manage field sections', true),
    ('layouts.manage', 'layouts', 'Manage record layouts', true),
    ('option_sets.manage', 'option_sets', 'Manage option sets', true),
    ('data_quality.view', 'config', 'View config/layout data quality reports', true)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

INSERT INTO public.permission_keys (key, label, group_key, description, is_active)
VALUES
    ('config_assist.generate', 'Generate config/layout proposals', 'config', 'Orchestrator + propose APIs.', true),
    ('config_assist.review', 'Review config/layout proposals', 'config', 'Review / reject lifecycle.', true),
    ('config_assist.apply', 'Apply approved config/layout proposals', 'config', 'Execute approved proposals.', true),
    ('fields.manage', 'Manage field definitions', 'fields', NULL, true),
    ('fields.requirements.manage', 'Manage field requirement policies', 'fields', NULL, true),
    ('fields.editability.manage', 'Manage field editability policies', 'fields', NULL, true),
    ('sections.manage', 'Manage field sections', 'sections', NULL, true),
    ('layouts.manage', 'Manage record layouts', 'layouts', NULL, true),
    ('option_sets.manage', 'Manage option sets', 'option_sets', NULL, true),
    ('data_quality.view', 'View config/layout data quality', 'config', NULL, true)
ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label,
    group_key = EXCLUDED.group_key,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

INSERT INTO public.permission_definitions (key, group_key, label, is_active)
VALUES
    ('config_assist.generate', 'config', 'Generate config/layout proposals', true),
    ('config_assist.review', 'config', 'Review config/layout proposals', true),
    ('config_assist.apply', 'config', 'Apply approved config/layout proposals', true),
    ('fields.manage', 'fields', 'Manage field definitions', true),
    ('fields.requirements.manage', 'fields', 'Manage field requirement policies', true),
    ('fields.editability.manage', 'fields', 'Manage field editability policies', true),
    ('sections.manage', 'sections', 'Manage field sections', true),
    ('layouts.manage', 'layouts', 'Manage record layouts', true),
    ('option_sets.manage', 'option_sets', 'Manage option sets', true),
    ('data_quality.view', 'config', 'View config/layout data quality', true)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

-- Default: org admin receives full config assist + field/layout manage keys (idempotent).
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT o.id, 'admin', k.key, true
FROM public.orgs AS o
CROSS JOIN (
    VALUES
        ('config_assist.generate'),
        ('config_assist.review'),
        ('config_assist.apply'),
        ('fields.manage'),
        ('fields.requirements.manage'),
        ('fields.editability.manage'),
        ('sections.manage'),
        ('layouts.manage'),
        ('option_sets.manage'),
        ('data_quality.view')
) AS k(key)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.role_permission_grants AS g
    WHERE g.org_id = o.id
      AND g.role_key = 'admin'
      AND g.permission_key = k.key
);
