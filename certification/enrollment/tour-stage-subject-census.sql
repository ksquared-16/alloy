-- Is there ANY live subject at the Tour stage to run stage-exit QA against?
-- The Tours lane renders "No records in this view", but that lane is case-grain and filtered, so
-- an empty lane is not proof of an empty tenant (the "census zero is two answers" trap). This asks
-- the record itself, and also reports a total so a zero can be told apart from a wrong filter.
SELECT question_id, kind, payload
FROM (
    SELECT 'q1_stage_distribution' AS question_id,
           'row' AS kind,
           concat_ws(' | ',
               'stage=' || coalesce(to_jsonb(o.*) ->> 'stage_key', 'null'),
               'status=' || coalesce(to_jsonb(o.*) ->> 'status', 'null'),
               'count=' || count(*)::text
           ) AS payload,
           1 AS ord
      FROM public.opportunities o
     WHERE o.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
     GROUP BY to_jsonb(o.*) ->> 'stage_key', to_jsonb(o.*) ->> 'status'

    UNION ALL

    SELECT 'q2_total_opportunities',
           'scalar',
           count(*)::text,
           2
      FROM public.opportunities o
     WHERE o.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
) s
ORDER BY ord, payload;
