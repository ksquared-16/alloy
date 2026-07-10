-- Communications Identity Platform — backfill certification queries
-- Run after applying 20260715120000_communications_identity_platform_foundation.sql
-- Usage: psql $DATABASE_URL -f supabase/tests/communications_identity_backfill_certification.sql

\echo '=== Account count vs legacy bindings with resolvable addresses ==='
SELECT
    (SELECT count(*) FROM public.communication_provider_bindings) AS legacy_bindings_total,
    (SELECT count(*) FROM public.communication_provider_accounts) AS provider_accounts,
    (SELECT count(*) FROM public.communication_identities) AS identities,
    (SELECT count(*) FROM public.communication_identity_location_bindings) AS location_bindings;

\echo '=== Duplicate legacy_binding_id (must be zero) ==='
SELECT legacy_binding_id, count(*)
FROM public.communication_provider_accounts
WHERE legacy_binding_id IS NOT NULL
GROUP BY legacy_binding_id
HAVING count(*) > 1;

\echo '=== Duplicate identity legacy_binding_id (must be zero) ==='
SELECT legacy_binding_id, count(*)
FROM public.communication_identities
WHERE legacy_binding_id IS NOT NULL
GROUP BY legacy_binding_id
HAVING count(*) > 1;

\echo '=== Duplicate location binding per identity+location (must be zero) ==='
SELECT identity_id, location_id, count(*)
FROM public.communication_identity_location_bindings
GROUP BY identity_id, location_id
HAVING count(*) > 1;

\echo '=== Multiple defaults per location+channel (must be zero) ==='
SELECT org_id, location_id, channel, count(*)
FROM public.communication_identity_location_bindings
WHERE is_default = true AND status = 'active'
GROUP BY org_id, location_id, channel
HAVING count(*) > 1;

\echo '=== Bindings skipped (no backfilled account) — review manually ==='
SELECT b.id, b.org_id, b.channel, b.provider, b.status, b.inbound_to_e164, b.config
FROM public.communication_provider_bindings b
LEFT JOIN public.communication_provider_accounts pa ON pa.legacy_binding_id = b.id
WHERE pa.id IS NULL;

\echo '=== Idempotency check: re-run backfill block manually; counts above should be unchanged ==='

\echo ''
\echo '=== Phase 3 certification (run communications_identity_phase3_certification.sql after Phase 3 migration) ==='
