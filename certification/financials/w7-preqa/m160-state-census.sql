-- 20261122160000 on the deployed primary, per object and ledger, in ONE statement (W7-F010).
SELECT 'g' AS question_id, 'session_write_grants' AS kind,
       json_build_object('table', t.name,
                         'authenticated_writes', (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants g
                                                   WHERE g.table_schema='public' AND g.table_name=t.name AND g.grantee='authenticated' AND g.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')),
                         'anon_writes', (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants g
                                          WHERE g.table_schema='public' AND g.table_name=t.name AND g.grantee='anon' AND g.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')),
                         'authenticated_select', has_table_privilege('authenticated', 'public.' || t.name, 'SELECT'),
                         'session_write_policies', (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.name
                                                    AND 'authenticated' = ANY (p.roles) AND p.cmd IN ('INSERT','UPDATE','DELETE') AND p.permissive = 'PERMISSIVE'))::text AS payload
  FROM (VALUES ('charges'), ('payments'), ('payment_allocations'), ('ledger_transactions'), ('resolved_obligations')) AS t(name)
UNION ALL
SELECT 'd', 'definer_exec',
       json_build_object('function', f.name,
                         'authenticated', has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE'),
                         'anon', has_function_privilege('anon', to_regprocedure(f.sig), 'EXECUTE'),
                         'service_role', has_function_privilege('service_role', to_regprocedure(f.sig), 'EXECUTE'))::text
  FROM (VALUES ('post_ledger_transaction', 'public.post_ledger_transaction(uuid)'),
               ('stamp_payment_posted_to_ledger_at', 'public.stamp_payment_posted_to_ledger_at(uuid)'),
               ('reconcile_consumption_correction', 'public.reconcile_consumption_correction(uuid,uuid,jsonb)')) AS f(name, sig)
UNION ALL
SELECT 'l', 'ledger',
       json_build_object('version', '20261122160000',
                         'in_ledger', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations s WHERE s.version = '20261122160000'),
                         'head', (SELECT max(version) FROM supabase_migrations.schema_migrations),
                         'total', (SELECT count(*) FROM supabase_migrations.schema_migrations))::text
