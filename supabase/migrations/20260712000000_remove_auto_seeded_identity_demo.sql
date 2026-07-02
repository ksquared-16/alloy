-- =============================================================================
-- Platform Reset — remove the auto-seeded "Rivera Family" identity demo
-- =============================================================================
-- Doctrine (Platform Reset sprint): no operational/business records may appear
-- automatically. Migration 20260423143000 inserts a Rivera household + child +
-- opportunity on every fresh `db push` (guarded only by org existence). That is
-- the sole auto-seeder of business data. This migration removes those rows
-- (scoped by the seed's stable external_id markers + fixture email), so a fresh
-- push ends clean and already-seeded environments are cleaned in place.
--
-- Config rows from 20260423143000 (role types, relationship types) are NOT
-- touched — only the business/operational records. If a demo identity is wanted,
-- create it via an explicit developer seed command, never a migration.
-- FK-safe order: opportunities -> customer_members -> customer_persons -> persons -> customers.
-- =============================================================================

DELETE FROM public.opportunities
WHERE external_id = 'seed_opportunity_identity_opportunity_v1';

DELETE FROM public.customer_members cm
USING public.customers c
WHERE cm.customer_id = c.id
  AND c.external_id = 'seed_opportunity_identity_household_v1';

DELETE FROM public.customer_persons cp
USING public.customers c
WHERE cp.customer_id = c.id
  AND c.external_id = 'seed_opportunity_identity_household_v1';

DELETE FROM public.persons
WHERE email = 'ava.rivera@example.com';

DELETE FROM public.customers
WHERE external_id = 'seed_opportunity_identity_household_v1';
