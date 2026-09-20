-- Hosted migration convergence preflight for 20260921140000 (PR #1102). Read only, ONE statement.
--
-- Answers the only question that decides whether applying it is safe: is it genuinely unapplied, or
-- is its PHYSICAL EFFECT already present while the ledger row is missing?
--
-- The migration's whole effect is `CREATE OR REPLACE FUNCTION
-- public.count_active_lead_participations(uuid, uuid, uuid[])` plus its COMMENT. So the function's
-- existence is the physical test, and `supabase_migrations.schema_migrations` is the ledger test.
--
--   ledger absent + function absent   → genuinely unapplied, safe to apply
--   ledger absent + function PRESENT  → PHYSICAL_TRUTH_LEDGER_DIVERGENCE, stop and report
--   ledger present                    → already converged, nothing to do
--
-- Emitted as question_id | kind | payload.
select
    'preflight' as question_id,
    'row' as kind,
    json_build_object(
        'ledger_has_20260921140000', (select count(*) from supabase_migrations.schema_migrations
                                        where version = '20260921140000'),
        'function_exists',           (to_regprocedure('public.count_active_lead_participations(uuid, uuid, uuid[])') is not null),
        'function_any_signature',    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                        where n.nspname = 'public' and p.proname = 'count_active_lead_participations'),
        'ledger_head',               (select max(version) from supabase_migrations.schema_migrations),
        'ledger_total',              (select count(*) from supabase_migrations.schema_migrations),
        'newer_than_target',         (select count(*) from supabase_migrations.schema_migrations
                                        where version > '20260921140000'),
        'database_identity',         current_database() || '@' || coalesce(inet_server_addr()::text, 'local')
    )::text as payload;
