-- Payments V1 · W2 — is the deployed primary still behind staging?
--
-- The merge of PR #1100 was refused `hosted_migration_behind`: the deployed primary lacked
-- 20260919160000 (location_topology_mutation_backstop, promoted via PR #1098). That migration is not
-- this lane's, so this asks whether it has since been applied rather than applying it.
--
-- ONE STATEMENT, read only, emitted as question_id | kind | payload.
select
    'deployed_ledger' as question_id,
    'row' as kind,
    json_build_object(
        'has_20260919160000', (select count(*) from supabase_migrations.schema_migrations where version = '20260919160000'),
        'has_20260920120000_w1', (select count(*) from supabase_migrations.schema_migrations where version = '20260920120000'),
        'has_20260921120000_w2_create', (select count(*) from supabase_migrations.schema_migrations where version = '20260921120000'),
        'has_20260921130000_w2_drop', (select count(*) from supabase_migrations.schema_migrations where version = '20260921130000'),
        'newest_applied', (select max(version) from supabase_migrations.schema_migrations),
        'total_applied', (select count(*) from supabase_migrations.schema_migrations)
    )::text as payload;
