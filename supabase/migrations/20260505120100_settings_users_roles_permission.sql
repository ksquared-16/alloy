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
