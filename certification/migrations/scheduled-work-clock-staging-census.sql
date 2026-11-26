-- Governed Scheduled Work V1 — post-apply census of the clock instrument in staging.
-- Catalog-only for the objects the migration introduces, so an unapplied migration
-- answers false instead of failing to parse and taking every other answer with it.
select
  'gswclock' as question_id,
  'row'      as kind,
  json_build_object(
    'tbl_clock',            to_regclass('public.scheduled_work_clock') is not null,
    'rls_clock',            coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='scheduled_work_clock'), false),
    'grants_authed_anon',   (select count(*) from information_schema.role_table_grants g where g.table_schema='public' and g.table_name='scheduled_work_clock' and g.grantee in ('authenticated','anon')),
    'fn_record_wake',       exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_scheduled_work_wake'),
    'fn_exec_authed_anon',  (select count(*) from information_schema.role_routine_grants g where g.routine_schema='public' and g.routine_name='record_scheduled_work_wake' and g.grantee in ('authenticated','anon')),
    'clock_columns',        (select count(*) from information_schema.columns c where c.table_schema='public' and c.table_name='scheduled_work_clock' and c.column_name in ('first_wake_at','last_wake_at','wake_count','last_worker_id','last_summary')),
    'ledger_20260930120000', exists (select 1 from supabase_migrations.schema_migrations m where m.version = '20260930120000'),
    'employments_control',  (select count(*) from public.employments),
    'observed_at',          now()::text
  )::text as payload;
