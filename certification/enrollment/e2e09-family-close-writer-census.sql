-- E2E-09 family-close writer + closing-status census (read-only, catalog + config + aggregate).
-- q1: active action_definitions that can write opportunities.status_key through the legacy
--     executeAdminAction fallback (action_type update_status, or open_form submitting update_status /
--     carrying after.update_status_key). Reachable only if such a row exists.
-- q2: the live case-status vocabulary — every distinct opportunities.status_key with its count, so a
--     non-`closed` terminal key ('lost', 'withdrawn', ...) in real data is visible.
-- q3: configured opportunity status_definitions with their terminal / closed flags.
SELECT 'e2e09_family_close_writers' AS question_id,
       'row' AS kind,
       json_build_object(
           'q1_legacy_status_actions', (
               SELECT coalesce(json_agg(x ORDER BY x->>'key', x->>'action_type'), '[]'::json) FROM (
                   SELECT json_build_object(
                       'key', ad.key,
                       'action_type', ad.action_type,
                       'entity_type', ad.entity_type,
                       'status_key', ad.payload_schema->>'status_key',
                       'submit_action_type', ad.payload_schema->>'submit_action_type',
                       'after_update_status_key', ad.payload_schema->'after'->>'update_status_key',
                       'orgs', count(DISTINCT ad.org_id),
                       'global_rows', count(*) FILTER (WHERE ad.org_id IS NULL)
                   ) AS x
                   FROM public.action_definitions ad
                   WHERE coalesce(ad.is_active, true)
                     AND (ad.entity_type IS NULL OR lower(ad.entity_type) IN ('opportunity', 'opportunities'))
                     AND (ad.action_type = 'update_status'
                          OR (ad.action_type = 'open_form'
                              AND (ad.payload_schema->>'submit_action_type' = 'update_status'
                                   OR ad.payload_schema->'after' ? 'update_status_key')))
                   GROUP BY ad.key, ad.action_type, ad.entity_type, ad.payload_schema->>'status_key',
                            ad.payload_schema->>'submit_action_type', ad.payload_schema->'after'->>'update_status_key'
               ) s
           ),
           'q2_case_status_vocabulary', (
               SELECT coalesce(json_object_agg(k, n), '{}'::json) FROM (
                   SELECT coalesce(o.status_key, 'null') AS k, count(*) AS n
                   FROM public.opportunities o GROUP BY 1
               ) v
           ),
           'q3_opportunity_status_definitions', (
               SELECT coalesce(json_agg(d ORDER BY d->>'status_key'), '[]'::json) FROM (
                   SELECT json_build_object(
                       'status_key', sd.status_key,
                       'active', sd.is_active,
                       'terminal', coalesce(sd.metadata->>'terminal', sd.metadata->>'is_closed', sd.metadata->>'status_category'),
                       'orgs', count(DISTINCT sd.org_id),
                       'global_rows', count(*) FILTER (WHERE sd.org_id IS NULL)
                   ) AS d
                   FROM public.status_definitions sd
                   WHERE sd.entity_type = 'opportunities'
                   GROUP BY sd.status_key, sd.is_active,
                            coalesce(sd.metadata->>'terminal', sd.metadata->>'is_closed', sd.metadata->>'status_category')
               ) t
           )
       )::text AS payload;
