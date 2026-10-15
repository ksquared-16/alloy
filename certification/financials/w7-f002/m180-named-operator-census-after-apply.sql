-- AFTER gar_1e1ffe8cd6542c applied 20261122180000 to staging (2026-10-14).
-- W7-F002 (corrected) — is 20261122180000 on the deployed primary? Catalog only, one statement.
-- Per function: exists, and whether its body judges the NAMED operator (not the Person link).
SELECT 'f' AS question_id, 'function' AS kind,
       json_build_object('label', f.name,
                         'exists', to_regprocedure(f.sig) IS NOT NULL,
                         'named_operator', COALESCE(position('named_operator' IN pg_get_functiondef(to_regprocedure(f.sig))) > 0
                                                    OR position('user_account_display_name' IN pg_get_functiondef(to_regprocedure(f.sig))) > 0, false),
                         'service_role', CASE WHEN to_regprocedure(f.sig) IS NULL THEN NULL ELSE has_function_privilege('service_role', to_regprocedure(f.sig), 'EXECUTE') END,
                         'authenticated', CASE WHEN to_regprocedure(f.sig) IS NULL THEN NULL ELSE has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE') END)::text AS payload
  FROM (VALUES ('user_account_display_name', 'public.user_account_display_name(uuid)'),
               ('user_has_named_operator_identity', 'public.user_has_named_operator_identity(uuid,uuid)'),
               ('assert_assignment_delegation_ceiling', 'public.assert_assignment_delegation_ceiling(uuid,text,uuid,text[])'),
               ('enforce_user_roles_money_capable_person_link', 'public.enforce_user_roles_money_capable_person_link()'),
               ('enforce_money_capable_role_grant_person_links', 'public.enforce_money_capable_role_grant_person_links()'),
               ('revoke_user_person_link', 'public.revoke_user_person_link(uuid,uuid,uuid,text)')) AS f(name, sig)
UNION ALL
SELECT 'l', 'ledger',
       json_build_object('label', 'ledger', 'version', '20261122180000',
                         'in_ledger', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations s WHERE s.version = '20261122180000'),
                         'head', (SELECT max(version) FROM supabase_migrations.schema_migrations))::text
