-- Is the Integrations surface empty because it is broken, or because the platform catalog is empty?
--
-- Mounted Gate 2 certification reached the add-integration wizard and was told, by the product's own
-- `wizard-no-applications` state, that there is nothing to connect. `listApprovedApplications` reads
-- `developer_applications` where status = 'active' — a PLATFORM catalog, explicitly "a chooser, not
-- tenant CRUD", with no admin create route. So the distinction this census draws is the difference
-- between a surface defect and an environment data condition, and the nine BLOCKED scenarios in the
-- detail/access/credential half hang on it.
--
-- Also counts the retired producer tables: the retirement claim should be visible as their absence,
-- and a count that errors is itself the answer.
SELECT question_id, kind, payload
FROM (
    SELECT 'q1_developer_applications' AS question_id, 'row' AS kind,
           concat_ws(' | ', 'status=' || coalesce(to_jsonb(a.*) ->> 'status', 'null'), 'count=' || count(*)::text) AS payload,
           1 AS ord
      FROM public.developer_applications a
     GROUP BY to_jsonb(a.*) ->> 'status'

    UNION ALL

    SELECT 'q2_app_installations', 'scalar', count(*)::text, 2
      FROM public.app_installations i
     WHERE i.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'

    UNION ALL

    SELECT 'q3_app_credentials', 'scalar', count(*)::text, 3
      FROM public.app_credentials

    UNION ALL

    SELECT 'q4_integration_resource_refs', 'scalar', count(*)::text, 4
      FROM public.integration_resource_refs

    UNION ALL

    -- The retirement, stated as a count of what should no longer exist.
    SELECT 'q5_retired_producer_tables', 'row',
           concat_ws(' | ', 'table=' || t.table_name, 'present=yes'), 5
      FROM information_schema.tables t
     WHERE t.table_schema = 'public'
       AND t.table_name IN ('attendance_integration_producers',
                            'attendance_integration_producer_sites',
                            'attendance_integration_mappings')

    UNION ALL

    SELECT 'q6_producer_id_columns', 'scalar', count(*)::text, 6
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.column_name = 'producer_id'
) s
ORDER BY ord, payload;
