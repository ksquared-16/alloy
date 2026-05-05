-- Permission for delegated Settings: Users & Roles management (alongside org admin).
-- Admins receive this grant automatically per org so existing behavior stays unchanged.
--
-- role_permission_grants.permission_key is validated by BOTH:
--   - role_permission_grants_permissions_fkey -> permissions(key)
--   - role_permission_grants_permission_key_fkey -> permission_keys(key)
-- Seed permissions + permission_keys, then permission_definitions (admin RBAC UI), then grants.

INSERT INTO public.permissions (key, group_key, label, is_active)
VALUES (
    'settings.users_roles',
    'settings',
    'Manage users and roles',
    true
)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

INSERT INTO public.permission_keys (key, label, group_key, description, is_active)
VALUES (
    'settings.users_roles',
    'Manage users and roles',
    'settings',
    NULL,
    true
)
ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label,
    group_key = EXCLUDED.group_key,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

INSERT INTO public.permission_definitions (key, group_key, label, is_active)
VALUES (
    'settings.users_roles',
    'settings',
    'Manage users and roles',
    true
)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

-- role_permission_grants (org_id, role_key) -> role_definitions (org_id, role_key).
-- This migration runs before 20260505153000_backfill_default_role_definitions.sql; ensure
-- system roles exist so admin grants satisfy FK (idempotent; 153000 repeats the same upsert).

INSERT INTO public.role_definitions (org_id, role_key, role_label, description, is_system, is_active)
SELECT o.id,
       r.role_key,
       r.role_label,
       r.description,
       true,
       true
FROM public.orgs o
CROSS JOIN (
    VALUES
        ('admin', 'Admin', 'Full access'),
        ('ops', 'Ops', 'Operational access'),
        ('regional_lead', 'Regional lead', 'Regional manager persona'),
        ('school_director', 'School director', 'Site director persona')
) AS r(role_key, role_label, description)
ON CONFLICT (org_id, role_key) DO UPDATE
SET role_label = EXCLUDED.role_label,
    description = EXCLUDED.description,
    is_system = true,
    is_active = true;

INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT o.id, 'admin', 'settings.users_roles', true
FROM public.orgs AS o
WHERE NOT EXISTS (
    SELECT 1
    FROM public.role_permission_grants AS g
    WHERE g.org_id = o.id
      AND g.role_key = 'admin'
      AND g.permission_key = 'settings.users_roles'
);

COMMENT ON COLUMN public.permission_definitions.key IS
    'Stable permission identifier; e.g. settings.users_roles for Users & Roles settings surface.';
