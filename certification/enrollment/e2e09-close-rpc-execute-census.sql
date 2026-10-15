-- E2E-09: can a client session call a case-status writer RPC directly, skipping familyCloseRefusal?
-- Catalog-only. Reports, for every public function that writes opportunities.status_key, whether
-- authenticated / anon / PUBLIC hold EXECUTE, whether it is SECURITY DEFINER, and whether the
-- 20261104120000 boundary is recorded in the ledger.
SELECT 'e2e09_close_rpc_execute' AS question_id,
       'row' AS kind,
       json_build_object(
           'functions', (
               SELECT coalesce(json_agg(json_build_object(
                   'sig', p.oid::regprocedure::text,
                   'security_definer', p.prosecdef,
                   'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
                   'anon', has_function_privilege('anon', p.oid, 'EXECUTE')
               ) ORDER BY p.proname), '[]'::json)
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public'
                 AND pg_get_functiondef(p.oid) ~* 'update\s+(public\.)?opportunities\s'
                 AND pg_get_functiondef(p.oid) ~* 'status_key'
           ),
           'boundary_20261104120000_in_ledger', (
               SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261104120000'
           )
       )::text AS payload;
