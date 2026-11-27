select to_regclass('supabase_migrations.schema_migrations') is not null as alloy_has_ledger \gset
\if :alloy_has_ledger
select version from supabase_migrations.schema_migrations order by version;
\endif
