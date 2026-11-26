-- Does the Assignment Time Authority actually EXIST in staging, with its invariants?
-- The ledger saying "applied" is a label. A version collision could in principle have
-- produced a ledger/file disagreement, so the objects are asked for by name.
select
  'hoststruct' as question_id,
  'row'        as kind,
  json_build_object(
    'table_present',        to_regclass('public.assignment_weekday_intervals') is not null,
    'rls_enabled',          coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='assignment_weekday_intervals'), false),
    'policy_count',         (select count(*) from pg_policies where schemaname='public' and tablename='assignment_weekday_intervals'),
    'constraint_shape',     exists (select 1 from pg_constraint where conname='assignment_weekday_intervals_hours_shape'),
    'constraint_weekday',   exists (select 1 from pg_constraint where conname='assignment_weekday_intervals_weekday_range'),
    'constraint_overlap',   exists (select 1 from pg_constraint where conname='assignment_weekday_intervals_no_overlap'),
    'constraint_org_fk',    exists (select 1 from pg_constraint where conname='assignment_weekday_intervals_assignment_fk'),
    'idx_known',            exists (select 1 from pg_indexes where schemaname='public' and indexname='assignment_weekday_intervals_known_idx'),
    'idx_unknown',          exists (select 1 from pg_indexes where schemaname='public' and indexname='assignment_weekday_intervals_unknown_idx'),
    'trigger_knownness',    exists (select 1 from pg_trigger where tgname='validate_assignment_weekday_interval_knownness' and not tgisinternal),
    'trigger_seed_insert',  exists (select 1 from pg_trigger where tgname='seed_assignment_weekday_intervals_ins' and not tgisinternal),
    'trigger_seed_update',  exists (select 1 from pg_trigger where tgname='seed_assignment_weekday_intervals_upd' and not tgisinternal),
    'fn_parser',            exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pattern_default_hours_compat'),
    'grants_anon_authed',   (select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='assignment_weekday_intervals' and grantee='anon'),
    -- The collision check: the old version must NOT be masquerading as this migration.
    'old_version_in_ledger', exists (select 1 from supabase_migrations.schema_migrations where version='20261004120000'),
    'old_version_owner_is_payments', exists (select 1 from supabase_migrations.schema_migrations where version='20261004120000') and to_regclass('public.assignment_weekday_intervals') is not null,
    'observed_at',          now()::text
  )::text as payload;
