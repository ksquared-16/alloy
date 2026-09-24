-- Hosted migration ledger — fresh evidence after 20261025120000 was applied.
--
-- The queued merge was refused `hosted_migration_evidence_stale`: the payment-views migration
-- completed AFTER the census the gate was holding, so the evidence no longer described the
-- database. This re-measures the hosted ledger so the gate compares against what is actually
-- applied rather than against a snapshot taken before the apply.
--
-- Catalog-only, one statement, read only.
select
    'hosted_ledger_refresh' as question_id,
    'row' as kind,
    json_build_object(
        'newest_applied', (select max(version) from supabase_migrations.schema_migrations),
        'total_applied', (select count(*) from supabase_migrations.schema_migrations),
        'has_20261024120000', (select count(*) from supabase_migrations.schema_migrations where version = '20261024120000'),
        'has_20261025120000', (select count(*) from supabase_migrations.schema_migrations where version = '20261025120000'),
        'latest_ten', (
            select coalesce(json_agg(v order by v desc)::text, '[]')
            from (select version as v from supabase_migrations.schema_migrations order by version desc limit 10) t
        )
    )::text as payload;
