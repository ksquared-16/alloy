-- §14 / §24 — physically prove the acquisition function on the hosted database.
--
-- "applied" is a label on a ledger row. This reads the catalog itself: the function exists, with
-- the identity arguments the code calls, NOT security-definer, with a pinned search_path, and with
-- EXECUTE granted to service_role and to nobody else.
--
-- Catalog only. READ ONLY.
select 'fn_identity' as question_id, 'row' as kind,
  json_build_object(
    'functions', (select coalesce(json_agg(json_build_object(
        'name', p.proname,
        'args', pg_get_function_identity_arguments(p.oid),
        'returns', pg_get_function_result(p.oid),
        'security_definer', p.prosecdef,
        'volatility', p.provolatile,
        'settings', p.proconfig)), '[]'::json)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'financials_account_subject_facts')
  )::text as payload
union all
select 'fn_grants', 'row',
  json_build_object(
    'acl', (select coalesce(json_agg(a::text), '[]'::json)
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
                 lateral unnest(coalesce(p.proacl, '{}')) a
            where n.nspname = 'public' and p.proname = 'financials_account_subject_facts')
  )::text as payload
union all
select 'ledger', 'row',
  json_build_object(
    'has_20261026120000', exists(select 1 from supabase_migrations.schema_migrations where version = '20261026120000'),
    'max_version', (select max(version) from supabase_migrations.schema_migrations),
    'applied_count', (select count(*) from supabase_migrations.schema_migrations)
  )::text as payload;
