-- Seed minimal permission_definitions for the AdminV2 Roles permission grid.
-- These keys are org-agnostic catalog entries; grants are still per-org in role_permission_grants.
--
-- role_permission_grants.permission_key must exist in BOTH public.permissions and public.permission_keys
-- (dual FKs on the same column in this schema).

INSERT INTO public.permissions (key, group_key, label, is_active)
VALUES
    ('crm.opportunities.read', 'crm', 'View opportunities / inquiries', true),
    ('crm.opportunities.write', 'crm', 'Manage opportunities / inquiries', true),
    ('crm.customers.read', 'crm', 'View customers / families', true),
    ('crm.customers.write', 'crm', 'Manage customers / families', true),

    ('communications.read', 'communications', 'View communications', true),
    ('communications.send', 'communications', 'Send communications', true),

    ('scheduling.read', 'scheduling', 'View scheduling', true),
    ('scheduling.write', 'scheduling', 'Manage scheduling', true),

    ('billing.read', 'billing', 'View billing / payments', true),
    ('billing.write', 'billing', 'Manage billing / payments', true),

    ('documents.read', 'documents', 'View documents', true),
    ('documents.write', 'documents', 'Manage documents', true),

    ('reports.read', 'reports', 'View reports / analytics', true),
    ('reports.write', 'reports', 'Manage reports / analytics', true),

    ('settings.read', 'settings', 'View settings', true),
    ('settings.manage', 'settings', 'Manage settings', true),

    ('settings.users_roles.read', 'settings', 'View users & roles', true)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

INSERT INTO public.permission_keys (key, label, group_key, description, is_active)
VALUES
    ('crm.opportunities.read', 'View opportunities / inquiries', 'crm', NULL, true),
    ('crm.opportunities.write', 'Manage opportunities / inquiries', 'crm', NULL, true),
    ('crm.customers.read', 'View customers / families', 'crm', NULL, true),
    ('crm.customers.write', 'Manage customers / families', 'crm', NULL, true),

    ('communications.read', 'View communications', 'communications', NULL, true),
    ('communications.send', 'Send communications', 'communications', NULL, true),

    ('scheduling.read', 'View scheduling', 'scheduling', NULL, true),
    ('scheduling.write', 'Manage scheduling', 'scheduling', NULL, true),

    ('billing.read', 'View billing / payments', 'billing', NULL, true),
    ('billing.write', 'Manage billing / payments', 'billing', NULL, true),

    ('documents.read', 'View documents', 'documents', NULL, true),
    ('documents.write', 'Manage documents', 'documents', NULL, true),

    ('reports.read', 'View reports / analytics', 'reports', NULL, true),
    ('reports.write', 'Manage reports / analytics', 'reports', NULL, true),

    ('settings.read', 'View settings', 'settings', NULL, true),
    ('settings.manage', 'Manage settings', 'settings', NULL, true),

    ('settings.users_roles.read', 'View users & roles', 'settings', NULL, true)
ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label,
    group_key = EXCLUDED.group_key,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

INSERT INTO public.permission_definitions (key, group_key, label, is_active)
VALUES
    ('crm.opportunities.read', 'crm', 'View opportunities / inquiries', true),
    ('crm.opportunities.write', 'crm', 'Manage opportunities / inquiries', true),
    ('crm.customers.read', 'crm', 'View customers / families', true),
    ('crm.customers.write', 'crm', 'Manage customers / families', true),

    ('communications.read', 'communications', 'View communications', true),
    ('communications.send', 'communications', 'Send communications', true),

    ('scheduling.read', 'scheduling', 'View scheduling', true),
    ('scheduling.write', 'scheduling', 'Manage scheduling', true),

    ('billing.read', 'billing', 'View billing / payments', true),
    ('billing.write', 'billing', 'Manage billing / payments', true),

    ('documents.read', 'documents', 'View documents', true),
    ('documents.write', 'documents', 'Manage documents', true),

    ('reports.read', 'reports', 'View reports / analytics', true),
    ('reports.write', 'reports', 'Manage reports / analytics', true),

    ('settings.read', 'settings', 'View settings', true),
    ('settings.manage', 'settings', 'Manage settings', true),

    ('settings.users_roles.read', 'settings', 'View users & roles', true)
ON CONFLICT (key) DO UPDATE
SET group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

-- Ensure admin role gets these new permissions for every org (idempotent).
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT o.id, 'admin', p.key, true
FROM public.orgs o
JOIN public.permission_definitions p ON p.key IN (
    'crm.opportunities.read','crm.opportunities.write','crm.customers.read','crm.customers.write',
    'communications.read','communications.send',
    'scheduling.read','scheduling.write',
    'billing.read','billing.write',
    'documents.read','documents.write',
    'reports.read','reports.write',
    'settings.read','settings.manage',
    'settings.users_roles.read'
)
WHERE p.is_active = true
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

