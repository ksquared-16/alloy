-- Final checkpoint §2: which workflows author legacy messaging actions (create_message / send_message) on the deployed
-- database, versus the canonical send_communication_template; their recent runs; and legacy public.messages SMS rows
-- written by workflows in the last 90 days, by status. Read-only. Org ids truncated to 8 characters.
SELECT question_id, kind, payload
FROM (
    SELECT 'w1_actions' AS question_id, 'row' AS kind,
           concat_ws(' | ', 'type=' || a.action_type, 'channel=' || coalesce(a.payload ->> 'channel', '(default)'),
                     'enabled=' || w.enabled::text, 'event=' || w.event_type,
                     'declared_category=' || coalesce(a.payload ->> 'message_category', a.payload ->> 'category', 'none'),
                     'n=' || count(*)::text, 'orgs=' || count(DISTINCT w.org_id)::text,
                     'org8=' || string_agg(DISTINCT left(w.org_id::text, 8), ',')) AS payload, 1 AS ord
      FROM public.workflow_actions a JOIN public.workflows w ON w.id = a.workflow_id
     WHERE a.action_type IN ('create_message', 'send_message', 'send_communication_template')
     GROUP BY a.action_type, a.payload ->> 'channel', w.enabled, w.event_type,
              coalesce(a.payload ->> 'message_category', a.payload ->> 'category', 'none')
    UNION ALL
    SELECT 'w2_runs_90d', 'row',
           concat_ws(' | ', 'type=' || r.action_type, 'status=' || r.status, 'n=' || count(*)::text,
                     'last=' || max(r.started_at)::date::text), 2
      FROM public.workflow_action_runs r
     WHERE r.action_type IN ('create_message', 'send_message', 'send_communication_template')
       AND r.started_at > now() - interval '90 days'
     GROUP BY r.action_type, r.status
    UNION ALL
    SELECT 'w3_legacy_sms_90d', 'row',
           concat_ws(' | ', 'status=' || m.status, 'provider=' || coalesce(m.provider, 'none'),
                     'n=' || count(*)::text, 'last=' || max(m.created_at)::date::text), 3
      FROM public.messages m
     WHERE m.workflow_run_id IS NOT NULL AND m.channel = 'sms' AND m.direction = 'outbound'
       AND m.created_at > now() - interval '90 days'
     GROUP BY m.status, m.provider
    UNION ALL
    SELECT 'w0_totals', 'row',
           concat_ws(' | ', 'workflows=' || (SELECT count(*) FROM public.workflows)::text,
                     'enabled=' || (SELECT count(*) FROM public.workflows WHERE enabled)::text), 0
) q
ORDER BY ord, payload;
