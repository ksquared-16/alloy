-- FI-01 deployed: child health facts are reachable by the service role only — catalog facts, no rows.
SELECT question_id, kind, payload
FROM (
    SELECT 'g1_privileges' AS question_id, 'row' AS kind,
           concat_ws(' | ', r.role, p.priv, has_table_privilege(r.role, 'public.person_health_facts', p.priv)::text) AS payload
      FROM (VALUES ('authenticated'), ('anon'), ('service_role')) r(role)
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
    UNION ALL
    SELECT 'g2_policies', 'row', concat_ws(' | ', polname, array_to_string(polroles::regrole[], ','))
      FROM pg_policy WHERE polrelid = 'public.person_health_facts'::regclass
    UNION ALL
    SELECT 'g3_rls', 'row', concat_ws(' | ', relrowsecurity::text, relforcerowsecurity::text)
      FROM pg_class WHERE oid = 'public.person_health_facts'::regclass
) q
ORDER BY question_id, payload;
