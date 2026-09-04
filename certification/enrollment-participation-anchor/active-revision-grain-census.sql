-- Deployed Enrollment stage grain. Read-only: configuration values and counts only.
--
-- WHY THIS VERSION EXISTS. The previous artifact joined from `configuration_publications` and
-- returned NOTHING, which the trusted host reports as `result_parse_failed` — empty output is
-- indistinguishable from a broken query. A census must be able to report ABSENCE. This one always
-- emits `config_source` first, so a run can never come back silent.
--
-- AND IT READS BOTH SOURCES. `publish_business_process_revision_v1` writes an immutable revision AND
-- projects it into `departments.metadata.lifecycle_builder_v1`. A tenant configured before that
-- publication runtime existed has the projection and no revision at all. Which of those holds this
-- tenant's active Enrollment process is the thing being measured, not assumed.
select question_id, 'data' as row_kind, payload
from (
    -- ALWAYS ONE ROW. Where does this org's configuration actually live?
    select 'config_source'::text as question_id,
           json_build_object(
               'org_id', '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33',
               'departments_with_builder', (
                   select count(*) from public.departments d
                   where d.org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
                     and d.metadata ? 'lifecycle_builder_v1'
               ),
               'business_process_revisions', (
                   select count(*) from public.business_process_revisions r
                   where r.org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
               ),
               'configuration_publications', (
                   select count(*) from public.configuration_publications cp
                   where cp.org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
                     and cp.domain_key = 'business_process'
               ),
               'business_process_drafts', (
                   select count(*) from public.business_process_drafts d
                   where d.org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
               )
           )::text as payload

    union all

    -- One row per department that carries a builder projection.
    select 'department'::text,
           json_build_object(
               'department_id', d.id,
               'department_name', d.name,
               'active_process_id', d.metadata->'lifecycle_builder_v1'->>'active_process_id',
               'process_count', jsonb_array_length(coalesce(d.metadata->'lifecycle_builder_v1'->'processes','[]'::jsonb)),
               'latest_revision_number', (
                   select max(r.revision_number) from public.business_process_revisions r
                   where r.org_id = d.org_id and r.department_id = d.id
               )
           )::text
    from public.departments d
    where d.org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
      and d.metadata ? 'lifecycle_builder_v1'

    union all

    -- The grain question itself, read from the projection that the runtime and the publish RPC
    -- both keep in step. One row per stage.
    select 'stage_grain'::text,
           json_build_object(
               'department_id', d.id,
               'process_key', proc->>'key',
               'process_is_active', proc->>'is_active',
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
    from public.departments d
    cross join lateral jsonb_array_elements(coalesce(d.metadata->'lifecycle_builder_v1'->'processes','[]'::jsonb)) proc
    cross join lateral jsonb_array_elements(coalesce(proc->'stages','[]'::jsonb)) stage
    where d.org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
      and d.metadata ? 'lifecycle_builder_v1'

    union all

    select 'entry_points'::text,
           json_build_object(
               'department_id', d.id,
               'process_key', proc->>'key',
               'by_intent', proc->'entry_points_v1'->'by_intent'
           )::text
    from public.departments d
    cross join lateral jsonb_array_elements(coalesce(d.metadata->'lifecycle_builder_v1'->'processes','[]'::jsonb)) proc
    where d.org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
      and d.metadata ? 'lifecycle_builder_v1'
) census
order by question_id, payload
