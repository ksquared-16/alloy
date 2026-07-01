-- =============================================================================
-- Seed: realistic opportunity identity graph (Alloy Bend staging org)
-- Creates: customer (family), primary guardian person, child member, and opportunity linked to family.
-- Idempotent via external_id markers; safe to re-run.
-- No-op when the staging org row is absent (fresh local DB): RAISE NOTICE + RETURN.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid) THEN
    RAISE NOTICE 'Seed org 7803388d-cdee-4afb-89cf-23a137f39423 absent; skipping opportunity identity seed.';
    RETURN;
  END IF;

  -- Ensure a "guardian" role type exists for this org (used by resolver to label the primary person).
  INSERT INTO public.customer_person_role_types (org_id, key, label, description, sort_order, is_system, is_active, metadata)
  SELECT
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'guardian',
    'Guardian',
    'Primary guardian for a household (seed)',
    10,
    true,
    true,
    jsonb_build_object('seed_source', 'opportunity_identity_seed_childcare_org')
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.customer_person_role_types rt
    WHERE rt.org_id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
      AND rt.key = 'guardian'
  );

  -- Ensure a "child" member relationship type exists for this org.
  INSERT INTO public.customer_member_relationship_types (org_id, key, label, sort_order, is_system, is_active)
  SELECT
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'child',
    'Child',
    10,
    true,
    true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.customer_member_relationship_types t
    WHERE t.org_id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
      AND t.key = 'child'
  );

  -- Customer (household)
  INSERT INTO public.customers (org_id, name, status, external_source, external_id, metadata)
  SELECT
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'Rivera Family',
    'active',
    'seed',
    'seed_opportunity_identity_household_v1',
    jsonb_build_object('seed_source', 'opportunity_identity_seed_childcare_org')
  WHERE NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.org_id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
      AND c.external_id = 'seed_opportunity_identity_household_v1'
  );

  -- Primary guardian person
  INSERT INTO public.persons (org_id, first_name, last_name, full_name, email, phone, metadata)
  SELECT
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    'Ava',
    'Rivera',
    'Ava Rivera',
    'ava.rivera@example.com',
    '555-0102',
    jsonb_build_object('seed_source', 'opportunity_identity_seed_childcare_org')
  WHERE NOT EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.org_id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
      AND p.email = 'ava.rivera@example.com'
  );

  -- Link guardian to customer via customer_persons (role_type=guardian, is_primary=true).
  INSERT INTO public.customer_persons (org_id, customer_id, person_id, role_type, is_primary, metadata)
  SELECT
    '7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
    c.id,
    p.id,
    'guardian',
    true,
    jsonb_build_object('seed_source', 'opportunity_identity_seed_childcare_org')
  FROM public.customers c
  JOIN public.persons p
    ON p.org_id = c.org_id AND p.email = 'ava.rivera@example.com'
  WHERE c.org_id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
    AND c.external_id = 'seed_opportunity_identity_household_v1'
  ON CONFLICT (org_id, customer_id, person_id, role_type) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    metadata = COALESCE(public.customer_persons.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at = now();

  -- Child member attached to customer
  INSERT INTO public.customer_members (org_id, customer_id, display_name, relationship, dob, is_active, metadata)
  SELECT
    c.org_id,
    c.id,
    'Milo Rivera',
    'child',
    '2022-06-15'::date,
    true,
    jsonb_build_object('seed_source', 'opportunity_identity_seed_childcare_org')
  FROM public.customers c
  WHERE c.org_id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
    AND c.external_id = 'seed_opportunity_identity_household_v1'
    AND NOT EXISTS (
      SELECT 1 FROM public.customer_members cm
      WHERE cm.org_id = c.org_id
        AND cm.customer_id = c.id
        AND cm.display_name = 'Milo Rivera'
    );

  -- Opportunity linked to customer + primary person (guardian)
  INSERT INTO public.opportunities (org_id, customer_id, primary_person_id, name, source, status_key, external_source, external_id, metadata)
  SELECT
    c.org_id,
    c.id,
    p.id,
    'Childcare inquiry',
    'seed',
    'new',
    'seed',
    'seed_opportunity_identity_opportunity_v1',
    jsonb_build_object('seed_source', 'opportunity_identity_seed_childcare_org')
  FROM public.customers c
  JOIN public.persons p
    ON p.org_id = c.org_id AND p.email = 'ava.rivera@example.com'
  WHERE c.org_id = '7803388d-cdee-4afb-89cf-23a137f39423'::uuid
    AND c.external_id = 'seed_opportunity_identity_household_v1'
    AND NOT EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.org_id = c.org_id
        AND o.external_id = 'seed_opportunity_identity_opportunity_v1'
    );

END $$;
