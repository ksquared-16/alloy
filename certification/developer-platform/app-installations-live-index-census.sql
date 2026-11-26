-- Developer Platform: did migration 20261221100000 (reinstall after disconnect) land on the deployed primary?
-- Read-only, catalog only (pg_indexes, pg_index and the migration ledger). It reads no app_installations rows.
--   CHECKS
--     ri_app_org_live_present        uq_app_installations_app_org_live is UNIQUE on (application_id, org_id) WHERE status <> 'revoked'
--     ri_producer_key_live_present   uq_app_installations_producer_key_live is UNIQUE on (org_id, producer_key) WHERE status <> 'revoked'
--     ri_full_indexes_dropped        neither uq_app_installations_app_org nor uq_app_installations_producer_key remains
--     ri_ledger_has_20261221100000   the version is on supabase_migrations.schema_migrations (apply may not write it)
--   DATA ri_indexes: every app_installations index name and definition.
with idx as (
    select i.indexname, i.indexdef, x.indisunique as uniq
      from pg_indexes i
      join pg_class c on c.relname = i.indexname
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = i.schemaname
      join pg_index x on x.indexrelid = c.oid
     where i.schemaname = 'public' and i.tablename = 'app_installations'
)
select question_id, kind, payload
from (
    select 'ri_app_org_live_present'::text as question_id, 'check'::text as kind,
           'pg_indexes ~ uq_app_installations_app_org_live_partial_unique ~ present ~ '
           || exists (select 1 from idx where indexname = 'uq_app_installations_app_org_live' and uniq
                        and indexdef like '%(application_id, org_id)%' and indexdef like '%status <> ''revoked''%')::text as payload,
           '01'::text as sort_key
    union all
    select 'ri_producer_key_live_present', 'check',
           'pg_indexes ~ uq_app_installations_producer_key_live_partial_unique ~ present ~ '
           || exists (select 1 from idx where indexname = 'uq_app_installations_producer_key_live' and uniq
                        and indexdef like '%(org_id, producer_key)%' and indexdef like '%status <> ''revoked''%')::text,
           '02'
    union all
    select 'ri_full_indexes_dropped', 'check',
           'pg_indexes ~ uq_app_installations_app_org_and_producer_key_full ~ absent ~ '
           || (not exists (select 1 from idx where indexname in ('uq_app_installations_app_org', 'uq_app_installations_producer_key')))::text,
           '03'
    union all
    select 'ri_ledger_has_20261221100000', 'check',
           'schema_migrations ~ 20261221100000 ~ present ~ '
           || exists (select 1 from supabase_migrations.schema_migrations where version = '20261221100000')::text,
           '04'
    union all
    select 'ri_indexes', 'data',
           coalesce((select json_agg(json_build_object('name', indexname, 'unique', uniq, 'def', indexdef) order by indexname) from idx), '[]'::json)::text,
           '05'
) q
order by sort_key;
