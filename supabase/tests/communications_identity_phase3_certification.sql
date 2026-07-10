-- Communications Identity Platform — Phase 3 access-mode certification
-- Run after Phase 2 backfill certification.

\echo '=== Phase 3: invalid access modes (must be zero) ==='
SELECT id, default_access_mode
FROM public.communication_identities
WHERE default_access_mode NOT IN ('open_until_restricted', 'explicit_grants_required');

\echo '=== Phase 3: backfilled identities should be open_until_restricted ==='
SELECT id, default_access_mode, metadata->>'backfill_source' AS backfill_source
FROM public.communication_identities
WHERE metadata->>'backfill_source' = 'communication_provider_bindings'
  AND default_access_mode <> 'open_until_restricted';

\echo '=== Phase 3: schema default for new rows is explicit_grants_required ==='
SELECT column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'communication_identities'
  AND column_name = 'default_access_mode';

\echo '=== Phase 3: binding audit columns present ==='
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'communication_identity_location_bindings'
  AND column_name IN ('updated_by', 'metadata')
ORDER BY column_name;

\echo '=== Phase 3: grant tenant integrity (identity org must match grant org) ==='
SELECT g.id, g.org_id, i.org_id AS identity_org_id
FROM public.communication_identity_grants g
JOIN public.communication_identities i ON i.id = g.identity_id
WHERE g.org_id <> i.org_id;
