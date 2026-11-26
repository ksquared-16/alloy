-- Which external-clock mechanisms are actually reachable from inside staging?
-- GitHub Actions schedule is ruled out empirically (fires from the default branch
-- only, and has produced one tick ever). pg_cron + pg_net would let the database
-- itself be the clock, and a pg_cron schedule is installable through the governed
-- database.apply_migration capability this lane already holds — so whether those
-- extensions are available decides whether a clock can be built at all here.
select
  'clockmech' as question_id,
  'row'       as kind,
  json_build_object(
    'pg_cron_installed',    exists (select 1 from pg_extension where extname = 'pg_cron'),
    'pg_net_installed',     exists (select 1 from pg_extension where extname = 'pg_net'),
    'pg_cron_available',    exists (select 1 from pg_available_extensions where name = 'pg_cron'),
    'pg_net_available',     exists (select 1 from pg_available_extensions where name = 'pg_net'),
    'vault_available',      exists (select 1 from pg_available_extensions where name = 'supabase_vault'),
    'vault_installed',      exists (select 1 from pg_extension where extname = 'supabase_vault'),
    'installed_extensions', (select coalesce(json_agg(extname order by extname), '[]'::json) from pg_extension),
    'observed_at',          now()::text
  )::text as payload;
