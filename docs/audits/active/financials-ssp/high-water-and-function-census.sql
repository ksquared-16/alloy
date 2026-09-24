-- Financials server-side projection — what version may this slice claim, and does the
-- function name already exist?
--
-- The migration version must be unique and above the hosted high-water, and the on-disk
-- lineage is not proof of the hosted one: the two have diverged before. This asks the
-- deployed primary directly, catalog-only, one statement, read only.
select
    'financials_ssp_high_water' as question_id,
    'row' as kind,
    json_build_object(
        'newest_applied', (select max(version) from supabase_migrations.schema_migrations),
        'total_applied', (select count(*) from supabase_migrations.schema_migrations),
        'has_20261023120000', (select count(*) from supabase_migrations.schema_migrations where version = '20261023120000'),
        'fn_account_fact_bundle_exists', (
            select count(*) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle'
        ),
        'charges_indexes', (
            select count(*) from pg_indexes
            where schemaname = 'public' and tablename = 'charges'
        ),
        'payment_allocations_indexes', (
            select count(*) from pg_indexes
            where schemaname = 'public' and tablename = 'payment_allocations'
        )
    )::text as payload;
