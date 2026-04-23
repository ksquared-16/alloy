-- =============================================================================
-- Childcare orgs: ensure primary_contact customer_person_role_types row
-- =============================================================================
-- Booking and demo flows use customer_persons.role_type = 'primary_contact'
-- (see web/lib/bookingCustomerPersonLink.ts). Childcare control-plane seed adds
-- parent/guardian/etc. but does not add primary_contact. This migration inserts
-- the org-wide (null industry_id / vertical_id) row only where missing.
-- Idempotent: NOT EXISTS on org + key + default scope tier.
-- =============================================================================

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
    'primary_contact'::text,
    'Primary contact'::text,
    'Main human contact for the customer/account (booking and legacy flows).'::text,
    10,
    false,
    true,
    '{"seed_source": "migration_20260430103000_ensure_childcare_primary_contact_customer_person_role_type"}'::jsonb,
    NULL::uuid,
    NULL::uuid
FROM public.orgs o
INNER JOIN public.industries i
    ON i.id = o.industry_id
    AND i.key = 'childcare'
    AND COALESCE(i.is_active, true) = true
WHERE NOT EXISTS (
    SELECT 1
    FROM public.customer_person_role_types c
    WHERE c.org_id = o.id
      AND c.key = 'primary_contact'
      AND COALESCE(c.industry_id, '00000000-0000-0000-0000-000000000000'::uuid) = '00000000-0000-0000-0000-000000000000'::uuid
      AND COALESCE(c.vertical_id, '00000000-0000-0000-0000-000000000000'::uuid) = '00000000-0000-0000-0000-000000000000'::uuid
);
