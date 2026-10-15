-- W7-F010 / F008 on the deployed primary: session write exposure on money tables, the definer functions,
-- the org timeline (single-org windows make current_org_id() answer), and the two posted-without-entry
-- charges. Read-only, catalog plus three small row reads; one statement.
SELECT 'g' AS question_id, 'grants' AS kind,
       json_build_object('table', g.table_name, 'grantee', g.grantee,
                         'privileges', string_agg(g.privilege_type, ',' ORDER BY g.privilege_type))::text AS payload
  FROM information_schema.role_table_grants g
 WHERE g.table_schema = 'public' AND g.grantee IN ('authenticated', 'anon')
   AND g.table_name IN ('charges', 'payments', 'payment_allocations', 'ledger_transactions', 'resolved_obligations', 'financial_journal_entries')
 GROUP BY g.table_name, g.grantee
UNION ALL
SELECT 'p', 'write_policy',
       json_build_object('table', tablename, 'policy', policyname, 'cmd', cmd, 'permissive', permissive,
                         'using', qual, 'check', with_check)::text
  FROM pg_policies
 WHERE schemaname = 'public' AND 'authenticated' = ANY (roles) AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
   AND tablename IN ('charges', 'payments', 'payment_allocations', 'ledger_transactions', 'resolved_obligations', 'financial_journal_entries')
UNION ALL
SELECT 'd', 'definer_exec',
       json_build_object('function', p.proname, 'security_definer', p.prosecdef,
                         'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
                         'anon', has_function_privilege('anon', p.oid, 'EXECUTE'))::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
 WHERE p.proname IN ('post_ledger_transaction', 'stamp_payment_posted_to_ledger_at', 'reconcile_consumption_correction',
                     'post_charge_with_journal', 'insert_posted_charge_with_journal')
UNION ALL
SELECT 'o', 'org_timeline',
       json_build_object('org8', left(o.id::text, 8), 'created_at', o.created_at,
                         'orgs_existing_at_creation', (SELECT count(*) FROM public.orgs x WHERE x.created_at <= o.created_at))::text
  FROM public.orgs o
UNION ALL
SELECT 'c', 'current_org_id',
       json_build_object('answers', public.current_org_id() IS NOT NULL, 'orgs_now', (SELECT count(*) FROM public.orgs))::text
UNION ALL
SELECT 'x', 'aug26_pair',
       json_build_object('id', c.id, 'created_at', c.created_at, 'posted_at', c.posted_at, 'updated_at', c.updated_at,
                         'metadata_lifecycle_status', c.metadata->>'lifecycle_status',
                         'orgs_existing_at_post', (SELECT count(*) FROM public.orgs x WHERE x.created_at <= c.posted_at))::text
  FROM public.charges c
 WHERE c.id IN ('fc8df980-05c9-4614-b12e-0ab1e7daa72d', 'ef6c388f-8a7f-432d-9113-765669c9a962')
