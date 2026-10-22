-- FI-01 deployed (Medical visibility, 20261204090000): the restrictive policies on medical rows,
-- the permission function and its execute grants. Catalog only.
SELECT question_id, kind, payload
FROM (
    SELECT 'm1_policies' AS question_id, 'row' AS kind,
           concat_ws(' | ', c.relname, pol.polname, CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                     pol.polcmd::text, array_to_string(pol.polroles::regrole[], ',')) AS payload
      FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
     WHERE c.relnamespace = 'public'::regnamespace AND pol.polname LIKE '%medical%'
    UNION ALL
    SELECT 'm2_functions', 'row', concat_ws(' | ', p.proname, pg_get_function_identity_arguments(p.oid), 'secdef=' || p.prosecdef::text,
                     'anon_exec=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text,
                     'auth_exec=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text)
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('has_org_permission', 'is_child_health_field_definition', 'is_medical_form_definition', 'is_medical_form_submission')
) q
ORDER BY question_id, payload;
