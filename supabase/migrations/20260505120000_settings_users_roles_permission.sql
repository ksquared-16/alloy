-- Permission for delegated Settings: Users & Roles management (alongside org admin).
-- Admins receive this grant automatically per org so existing behavior stays unchanged.

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
