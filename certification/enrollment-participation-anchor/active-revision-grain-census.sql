WITH latest AS (
  SELECT DISTINCT ON (department_id) id, department_id, revision_number, payload
  FROM business_process_revisions
  WHERE org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
  ORDER BY department_id, revision_number DESC
),
proc AS (
  SELECT l.revision_number, p AS process
  FROM latest l, jsonb_array_elements(l.payload->'processes') p
),
stg AS (
  SELECT revision_number,
         process->>'key' AS process_key,
         process->'entry_points_v1'->'by_intent' AS entry_intents,
         s AS stage
  FROM proc, jsonb_array_elements(process->'stages') s
)
SELECT revision_number,
       process_key,
       entry_intents::text AS entry_points,
       stage->>'key' AS stage_key,
       stage->>'is_active' AS is_active,
       stage->>'grain' AS stage_grain_metadata,
       stage->>'track_key' AS track_key,
       stage->'stage_operating_plan_v1'->>'journey_segment' AS plan_journey_segment,
       (SELECT string_agg(o->>'outcome_key', ',' ORDER BY o->>'outcome_key')
          FROM jsonb_array_elements(COALESCE(stage->'stage_operating_plan_v1'->'outcomes','[]'::jsonb)) o) AS outcomes,
       (SELECT string_agg((r->>'when_outcome_key') || '=>' ||
              COALESCE((SELECT string_agg(COALESCE(t->>'kind','?') || COALESCE(':'||(t->>'stage_key'),'') || COALESCE('@'||(t->>'transition_ref'),'') || COALESCE('#'||(t->>'disposition_key'),''), '+')
                        FROM jsonb_array_elements(COALESCE(r->'targets','[]'::jsonb)) t), 'none'), ' | ')
          FROM jsonb_array_elements(COALESCE(stage->'stage_operating_plan_v1'->'outcome_rules','[]'::jsonb)) r) AS outcome_rule_targets
FROM stg
WHERE stage->>'key' IN ('decision','enrolling','enrolled','enrollment','waitlist','closed','closed_lost','closed_withdrawn')
ORDER BY process_key, stage->>'key';
