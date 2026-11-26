-- Manual verification: commercial_tuition_rates migration idempotency
-- Run after applying migrations on Preview/staging.
--
-- Expected v2 canonical columns on commercial_tuition_rates:
--   variant_id, cadence_key, payer_type, rate_cents, not_offered, location_id, org_id
-- program_key must NOT be required at runtime (dropped by v2 migration).

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'commercial_tuition_rates'
ORDER BY ordinal_position;

SELECT COUNT(*) AS migration_applied
FROM supabase_migrations.schema_migrations
WHERE version = '20260630120100';
