-- Governed Scheduled Work V1 — post-apply staging census.
-- Catalog-only by construction: no statement names a table the migration introduces
-- in a FROM clause, so an unapplied migration answers "false" instead of failing to parse.
select
  'gsw1' as question_id,
  'row'  as kind,
  json_build_object(
    'tbl_scheduled_work',            to_regclass('public.scheduled_work') is not null,
    'tbl_occurrences',               to_regclass('public.scheduled_work_occurrences') is not null,
    'tbl_attempts',                  to_regclass('public.scheduled_work_attempts') is not null,
    'rls_scheduled_work',            coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='scheduled_work'), false),
    'rls_occurrences',               coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='scheduled_work_occurrences'), false),
    'rls_attempts',                  coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='scheduled_work_attempts'), false),
    'grants_to_authenticated_anon',  (select count(*) from information_schema.role_table_grants g where g.table_schema='public' and g.table_name in ('scheduled_work','scheduled_work_occurrences','scheduled_work_attempts') and g.grantee in ('authenticated','anon')),
    'identity_unique_index',         exists (select 1 from pg_indexes i where i.schemaname='public' and i.tablename='scheduled_work_occurrences' and i.indexname='scheduled_work_occurrences_identity_idx'),
    'occurrence_columns',            (select count(*) from information_schema.columns c where c.table_schema='public' and c.table_name='scheduled_work_occurrences' and c.column_name in ('due_at','status','claim_token','claimed_by','lease_expires_at','attempt_count')),
    'attempt_columns',               (select count(*) from information_schema.columns c where c.table_schema='public' and c.table_name='scheduled_work_attempts' and c.column_name in ('attempt_number','worker_id','outcome','diagnostic')),
    'ledger_20260929120000',         exists (select 1 from supabase_migrations.schema_migrations m where m.version = '20260929120000'),
    'employments_control',           (select count(*) from public.employments)
  )::text as payload;
