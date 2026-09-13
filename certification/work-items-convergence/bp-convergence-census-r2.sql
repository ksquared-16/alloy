-- Does Business Process stage work exist for the enrollment certification opportunity, and is it
-- ONE row rather than two?
--
-- Work Items V3 claims BP work is not duplicated: Current Work executes an operational_tasks row
-- and Work Items projects THAT SAME row. The claim has only ever been read out of the code
-- (buildBusinessProcessWorkTaskMetadata stamps the row, completeStageWorkWithOutcome writes back to
-- it). This reads the database the application actually runs against, so the claim is measured
-- rather than argued.
--
-- Subject is the fixture's opportunity-backed family (Certopp). Only that family can carry stage
-- work at all: operational_tasks.entity_id references public.opportunities, so the context-free
-- family has nothing for a task row to point at.
--
-- Read-only. Ids, keys, counts and states only -- no person, child, family or free-text content.
select question_id, 'data' as row_kind, payload
from (
    -- Every operational_tasks row on the certification opportunity, classified by the same
    -- provenance keys isBusinessProcessStageWorkTaskRow() reads at runtime.
    select 'tasks_on_cert_opportunity'::text as question_id,
           json_build_object(
               'task_id', t.id,
               'source', t.source,
               'status', t.status,
               'is_bp_stage_work',
               (t.metadata->>'lifecycle_provenance' = 'lifecycle_template'
                 or t.metadata->>'operating_plan_template' = 'true'),
               'work_intent_key', t.metadata->>'work_intent_key',
               'lifecycle_stage_key', t.metadata->>'lifecycle_stage_key',
               'operating_plan_template_key', t.metadata->>'operating_plan_template_key',
               'has_assignee', (t.assigned_to_user_id is not null),
               'has_due', (t.due_at is not null)
           )::text as payload
    from public.operational_tasks t
    where t.entity_id = '468a5a95-dcfa-45ab-9829-34709dd9a154'

    union all

    -- THE DUPLICATION QUESTION. More than one OPEN stage-work row for the same
    -- (entity, work intent, stage) would mean a second copy of one piece of work.
    select 'duplicate_open_bp_work'::text,
           json_build_object(
               'entity_id', g.entity_id,
               'work_intent_key', g.intent,
               'lifecycle_stage_key', g.stage,
               'open_rows', g.n
           )::text
    from (
        select t.entity_id,
               t.metadata->>'work_intent_key' as intent,
               t.metadata->>'lifecycle_stage_key' as stage,
               count(*) as n
        from public.operational_tasks t
        where t.status = 'open'
          and (t.metadata->>'lifecycle_provenance' = 'lifecycle_template'
               or t.metadata->>'operating_plan_template' = 'true')
        group by 1, 2, 3
        having count(*) > 1
    ) g

    union all

    -- Org-wide shape, so an empty result on the opportunity above can be told apart from
    -- "this tenant has no BP stage work at all".
    select 'bp_work_org_wide'::text,
           json_build_object('source', g.source, 'is_bp_stage_work', g.is_bp, 'rows', g.n)::text
    from (
        select t.source,
               (t.metadata->>'lifecycle_provenance' = 'lifecycle_template'
                 or t.metadata->>'operating_plan_template' = 'true') as is_bp,
               count(*) as n
        from public.operational_tasks t
        where t.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
        group by 1, 2
    ) g

    union all

    -- Where the certification opportunity actually sits. If no stage operating plan applies to its
    -- current stage, absent stage work is a configuration fact, not a convergence defect.
    -- Columns verified against the schema: public.opportunities carries status_key and stage_key.
    -- An earlier revision of this census assumed `status` and `department_id`; neither exists, and
    -- that is what failed the first execution.
    select 'cert_opportunity_position'::text,
           json_build_object(
               'opportunity_id', o.id,
               'status_key', o.status_key,
               'stage_key', o.stage_key,
               'work_unit_id', o.work_unit_id
           )::text
    from public.opportunities o
    where o.id = '468a5a95-dcfa-45ab-9829-34709dd9a154'
) census
order by question_id, payload
