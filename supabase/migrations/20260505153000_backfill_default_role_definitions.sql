-- Ensure each org has the expected system role_definitions so Settings → Users & Roles
-- can list and assign roles without relying on UI-only fallbacks.

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

