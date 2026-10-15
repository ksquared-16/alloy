-- 20261122170000 on the deployed primary, per object and ledger, in ONE statement (default admin package).
SELECT 'f' AS question_id, 'seed_default_rbac' AS kind,
       json_build_object('present', to_regprocedure('public.seed_default_rbac(uuid)') IS NOT NULL,
                         'def_md5', md5(pg_get_functiondef(to_regprocedure('public.seed_default_rbac(uuid)'))),
                         'carries', (SELECT json_object_agg(k, position('''' || k || '''' IN pg_get_functiondef(to_regprocedure('public.seed_default_rbac(uuid)'))) > 0)
                                       FROM unnest(ARRAY['fin.provider','integrations.read','integrations.manage','staff.compensation.read','staff.compensation.write','attendance.record.assigned_only']) AS k))::text AS payload
UNION ALL
SELECT 'l', 'ledger',
       json_build_object('version', '20261122170000',
                         'in_ledger', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations s WHERE s.version = '20261122170000'),
                         'head', (SELECT max(version) FROM supabase_migrations.schema_migrations),
                         'total', (SELECT count(*) FROM supabase_migrations.schema_migrations))::text
