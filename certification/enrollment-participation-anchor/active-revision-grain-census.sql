-- Deployed active-revision stage grain for the Enrollment process. Read-only, counts and
-- configuration values only.
--
-- OUTPUT CONTRACT. The trusted host parses `question_id|row_kind|payload` lines, payload being
-- JSON as TEXT. The first version of this file returned ordinary tabular columns, which is none of
-- the three shapes the parser accepts, and it failed `result_parse_failed`. Shape copied from
-- post-orphan-sweep-census.sql, which executed cleanly in this lane.
select question_id, 'data' as row_kind, payload
from (
    select 'active_revision'::text as question_id,
           json_build_object(
               'department_id', cp.subject_id,
               'revision_id', cp.revision_id,
               'revision_number', cp.revision_number,
               'payload_checksum', cp.payload_checksum,
               'published_at', cp.published_at
           )::text as payload
    from public.configuration_publications cp
    where cp.org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
      and cp.domain_key = 'business_process'
      and cp.revision_number = (
          select max(i.revision_number) from public.configuration_publications i
          where i.org_id = cp.org_id and i.domain_key = cp.domain_key and i.subject_id = cp.subject_id
      )

    union all

    -- One row per stage: what grain does it declare, and does it contradict itself?
    select 'stage_grain'::text,
           json_build_object(
               'department_id', cp.subject_id,
               'process_key', proc->>'key',
               'stage_key', stage->>'key',
               'is_active', stage->>'is_active',
               'metadata_grain', stage->>'grain',
               'plan_journey_segment', stage->'stage_operating_plan_v1'->>'journey_segment',
               'track_key', stage->>'track_key',
               'outcomes', (
                   select coalesce(json_agg(o->>'outcome_key' order by o->>'outcome_key'), '[]'::json)
                   from jsonb_array_elements(coalesce(stage->'stage_operating_plan_v1'->'outcomes','[]'::jsonb)) o
               ),
               'enrols_a_child', exists (
                   select 1
                   from jsonb_array_elements(coalesce(stage->'stage_operating_plan_v1'->'outcome_rules','[]'::jsonb)) r,
                        jsonb_array_elements(coalesce(r->'targets','[]'::jsonb)) t
                   where t->>'kind' = 'update_child_enrollment_status'
                     and t->>'disposition_key' = 'enrolled'
               ),
               'moves_to', (
                   select coalesce(json_agg(distinct coalesce(t->>'stage_key', t->>'transition_ref')), '[]'::json)
                   from jsonb_array_elements(coalesce(stage->'stage_operating_plan_v1'->'outcome_rules','[]'::jsonb)) r,
                        jsonb_array_elements(coalesce(r->'targets','[]'::jsonb)) t
                   where t->>'kind' = 'move_to_stage'
               ),
               'exits_to', (
                   select coalesce(json_agg(x->>'target_stage_key'), '[]'::json)
                   from jsonb_array_elements(coalesce(stage->'stage_operating_plan_v1'->'outgoing_transitions','[]'::jsonb)) x
               )
           )::text
    from public.configuration_publications cp
    join public.business_process_revisions r2 on r2.id = cp.revision_id
    cross join lateral jsonb_array_elements(coalesce(r2.payload->'processes','[]'::jsonb)) proc
    cross join lateral jsonb_array_elements(coalesce(proc->'stages','[]'::jsonb)) stage
    where cp.org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
      and cp.domain_key = 'business_process'
      and cp.revision_number = (
          select max(i.revision_number) from public.configuration_publications i
          where i.org_id = cp.org_id and i.domain_key = cp.domain_key and i.subject_id = cp.subject_id
      )

    union all

    select 'entry_points'::text,
           json_build_object(
               'department_id', cp.subject_id,
               'process_key', proc->>'key',
               'by_intent', proc->'entry_points_v1'->'by_intent'
           )::text
    from public.configuration_publications cp
    join public.business_process_revisions r3 on r3.id = cp.revision_id
    cross join lateral jsonb_array_elements(coalesce(r3.payload->'processes','[]'::jsonb)) proc
    where cp.org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
      and cp.domain_key = 'business_process'
      and cp.revision_number = (
          select max(i.revision_number) from public.configuration_publications i
          where i.org_id = cp.org_id and i.domain_key = cp.domain_key and i.subject_id = cp.subject_id
      )
) census
order by question_id, payload
