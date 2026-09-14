-- Did outcome_7 actually complete work_3 and move the case?
--
-- `complete-stage-work` returned ok:true with applied_targets [{move_to_stage, tour_transition_2}]
-- and failed_targets [], yet the transition preflight still reports Conduct Tour as OPEN and
-- canProceed:false. One of those two is wrong. The response also carried status_updated:false, so
-- the opportunity's own status is read here alongside the task's, rather than inferred from either.
SELECT question_id, kind, payload
FROM (
    SELECT 'q1_opportunity' AS question_id,
           'row' AS kind,
           concat_ws(' | ',
               'status_key=' || coalesce(to_jsonb(o.*) ->> 'status_key', 'null'),
               'updated_at=' || coalesce(to_jsonb(o.*) ->> 'updated_at', 'null'),
               'metadata=' || coalesce((to_jsonb(o.*) -> 'metadata')::text, 'null')
           ) AS payload,
           1 AS ord
      FROM public.opportunities o
     WHERE o.id = '8baf8418-654d-41dc-9779-1c8c44198e41'

    UNION ALL

    -- Every task on the case, open or not, so a completed row is distinguishable from a missing one.
    SELECT 'q2_tasks',
           'row',
           concat_ws(' | ',
               'id=' || t.id::text,
               'title=' || coalesce(to_jsonb(t.*) ->> 'title', 'null'),
               'status=' || coalesce(to_jsonb(t.*) ->> 'status', 'null'),
               'stage=' || coalesce(to_jsonb(t.*) -> 'metadata' ->> 'lifecycle_stage_key', 'null'),
               'template=' || coalesce(to_jsonb(t.*) -> 'metadata' ->> 'work_intent_key', 'null'),
               'outcome=' || coalesce(to_jsonb(t.*) -> 'metadata' ->> 'outcome_key', 'null'),
               'completed_at=' || coalesce(to_jsonb(t.*) ->> 'completed_at', 'null'),
               'updated_at=' || coalesce(to_jsonb(t.*) ->> 'updated_at', 'null')
           ),
           2
      FROM public.operational_tasks t
     WHERE t.entity_id = '8baf8418-654d-41dc-9779-1c8c44198e41'
) s
ORDER BY ord, payload;
