-- Processing Identity Resolution — local certification SQL
-- Usage: psql $DATABASE_URL -v ON_ERROR_STOP=1 -f supabase/tests/processing_identity_local_certification.sql

\echo '=== B0 orphan preflight (must be 0) ==='
SELECT count(*) AS orphan_persons
FROM persons p
LEFT JOIN orgs o ON o.id = p.org_id
WHERE o.id IS NULL;

\echo '=== Processing identity migrations applied ==='
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260716120000',
  '20260716130000',
  '20260716140000',
  '20260717120000',
  '20260717130000',
  '20260718120000'
)
ORDER BY version;

\echo '=== Processing tables ==='
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'processing_%'
ORDER BY tablename;

\echo '=== execute_processing_identity_group ==='
SELECT p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'execute_processing_identity_group';

\echo '=== Append-only guard on processing_commit_attempts ==='
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.processing_commit_attempts'::regclass
  AND tgname = 'trg_processing_commit_attempts_append_only';

\echo '=== Org-scoped RLS on processing_facts ==='
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'processing_facts';

\echo '=== create_lead source_kind in check constraint ==='
SELECT pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname = 'chk_pcs_source_kind';
