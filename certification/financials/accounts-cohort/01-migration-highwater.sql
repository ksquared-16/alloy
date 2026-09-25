-- §14 — the hosted migration high-water, read immediately before choosing a version.
--
-- A version collision can cause a silent FALSE SKIP: the apply reports success while the newer
-- file is never run, and the function the code then calls does not exist. So the version is chosen
-- from what the hosted ledger actually holds, not from what the local migrations directory shows.
--
-- Catalog and ledger only. READ ONLY.
select 'highwater' as question_id, 'row' as kind,
  json_build_object(
    'max_version', (select max(version) from supabase_migrations.schema_migrations),
    'applied_count', (select count(*) from supabase_migrations.schema_migrations),
    'newest_five', (select json_agg(v order by v desc)
                    from (select version as v from supabase_migrations.schema_migrations
                          order by version desc limit 5) t)
  )::text as payload
union all
select 'cohort_fn_exists', 'row',
  json_build_object(
    'names', (select coalesce(json_agg(json_build_object(
                'name', p.proname,
                'args', pg_get_function_identity_arguments(p.oid),
                'security_definer', p.prosecdef,
                'settings', p.proconfig)), '[]'::json)
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname like 'financials_account%')
  )::text as payload
union all
select 'subject_tables', 'row',
  json_build_object(
    'tables', (select json_agg(json_build_object('table', c.relname, 'has_org_id', exists(
                  select 1 from pg_attribute a where a.attrelid = c.oid
                    and a.attname = 'org_id' and a.attnum > 0 and not a.attisdropped))
                order by c.relname)
               from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind = 'r'
                 and c.relname in ('customers','customer_members','customer_persons','persons',
                                   'child_enrollment_agreements','child_placements',
                                   'process_instances','location_program_categories','locations'))
  )::text as payload;
