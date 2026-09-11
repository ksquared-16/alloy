-- Organization → Integrations needs permissions an operator can actually hold.
--
-- ── WHY THIS EXISTS ──
--
-- Gate 2 gates every integrations route on `integrations.read` or
-- `integrations.manage`, and those keys were enforced before they were ever
-- issued. Measured on alloy-cert: the seeded organization's `admin` role holds 68
-- grants and NONE of them is an integrations key, so a real tenant administrator
-- opening Integrations receives the same 403 a stranger does. A surface nobody
-- can reach is not a shipped surface.
--
-- ── ENUMERATED, NOT DERIVED ──
--
-- W-12 deliberately replaced the blanket "grant every catalog key to admin"
-- SELECT with an explicit list, because deriving grants from the catalog means
-- any migration that seeds a key silently widens what every organization's admin
-- receives. So these two keys are added to the catalog AND named explicitly in
-- the grant, and the widening is stated here rather than inferred.
--
-- `ops` is deliberately NOT granted. Read access to which external software is
-- connected, and to its API activity, is an administrative concern in V1;
-- widening it later is a deliberate decision, and narrower is the reversible
-- direction.

-- 1. The catalog entries.
INSERT INTO public.permission_definitions (key, label, group_key, description)
VALUES
    ('integrations.read',   'View integrations',   'integrations',
     'See connected external software, what it may access, and its recent API activity.'),
    ('integrations.manage', 'Manage integrations', 'integrations',
     'Connect software, change what it may access, and issue, rotate or revoke its credentials.')
ON CONFLICT (key) DO UPDATE
    SET label = EXCLUDED.label,
        group_key = EXCLUDED.group_key,
        description = EXCLUDED.description;

-- 2. Every EXISTING organization's admin. `seed_default_rbac` only runs for new
--    organizations, so without this backfill the keys would reach nobody who is
--    already using Alloy.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT DISTINCT g.org_id, 'admin', k.permission_key, true
FROM public.role_permission_grants g
CROSS JOIN (VALUES ('integrations.read'::text), ('integrations.manage')) AS k(permission_key)
WHERE g.role_key = 'admin'
ON CONFLICT (org_id, role_key, permission_key) DO UPDATE SET allowed = true;

-- 3. New organizations, through the canonical seeding function.
--
--    Appended to the enumerated admin list rather than to the catalog-derived
--    SELECT that W-12 removed, so a future catalog addition still grants nothing
--    by itself.
CREATE OR REPLACE FUNCTION public.seed_integrations_role_grants("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.role_permission_grants (org_id, role_key, permission_key, allowed)
  select p_org_id, 'admin', enumerated.permission_key, true
  from (values
      ('integrations.read'::text),
      ('integrations.manage')
  ) as enumerated(permission_key)
  on conflict (org_id, role_key, permission_key) do update set allowed = true;
end;
$$;

COMMENT ON FUNCTION public.seed_integrations_role_grants(uuid) IS
    'Grants the Organization → Integrations permissions to an organization admin role. Enumerated deliberately: adding a catalog key must never widen a grant on its own.';
