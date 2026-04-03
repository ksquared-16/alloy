-- Seed: ensure each org has customer_person_role_types.key = 'primary_contact' (org-wide scope).
-- Idempotent INSERT only where missing; never updates existing rows.
-- Table columns: supabase/baselines/prod_baseline.sql CREATE TABLE public.customer_person_role_types (lines 1098–1112).

-- Book-v2 uses customer_persons.role_type = 'primary_contact' (see web/lib/bookingCustomerPersonLink.ts).
-- Unique scope: uq_customer_person_role_types_scope_key on
--   (org_id, coalesce(industry_id, '00000000-0000-0000-0000-000000000000'::uuid),
--    coalesce(vertical_id, '00000000-0000-0000-0000-000000000000'::uuid), key).

-- Verification (run manually after migrate):
--   SELECT id, org_id, key, label, industry_id, vertical_id, is_active
--   FROM public.customer_person_role_types
--   WHERE key = 'primary_contact' AND industry_id IS NULL AND vertical_id IS NULL
--   ORDER BY org_id;
--
--   SELECT o.id AS org_id
--   FROM public.orgs o
--   WHERE NOT EXISTS (
--     SELECT 1
--     FROM public.customer_person_role_types c
--     WHERE c.org_id = o.id
--       AND c.key = 'primary_contact'
--       AND c.industry_id IS NULL
--       AND c.vertical_id IS NULL
--   );

INSERT INTO public.customer_person_role_types (
    org_id,
    key,
    label,
    description,
    sort_order,
    is_system,
    is_active,
    metadata,
    industry_id,
    vertical_id
)
SELECT
    o.id,
    'primary_contact',
    'Primary Contact',
    'Main human contact for the customer/account',
    10,
    false,
    true,
    '{"seed_source": "migration_20260403101000_customer_person_role_type_primary_contact_seed"}'::jsonb,
    NULL,
    NULL
FROM public.orgs AS o
WHERE NOT EXISTS (
    SELECT 1
    FROM public.customer_person_role_types AS c
    WHERE c.org_id = o.id
      AND c.key = 'primary_contact'
      AND c.industry_id IS NULL
      AND c.vertical_id IS NULL
);
