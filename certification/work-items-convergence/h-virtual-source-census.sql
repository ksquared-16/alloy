-- Does the certification tenant hold anything for Slice H to exercise, and do the virtual sources
-- keep their promise of persisting nothing?
--
-- Work Items projects Communications and Processing work VIRTUALLY: the rows are built for display
-- from the domain's own state and must never be written back as operational_tasks. Two questions
-- follow, and only the database can answer either.
--
-- 1. Is there real actionable Communications / Processing state at all? If there is none, Slice H is
--    blocked by ABSENT SOURCE DATA, not by browser identity, and no amount of QA access fixes it.
-- 2. Has any projection leaked into durable truth? A single operational_tasks row carrying a
--    conversation or processing-case identity would be the duplicate persistence the doctrine forbids.
--
-- Read-only. Counts, states and key names only -- no message bodies, no person, child or family
-- content, no free text.
select question_id, 'data' as row_kind, payload
from (
    select 'comms_threads_by_attention'::text as question_id,
           json_build_object(
               'attention_state', g.attention_state,
               'assignment_state', g.assignment_state,
               'threads', g.n
           )::text as payload
    from (
        select t.attention_state, t.assignment_state, count(*) as n
        from public.communication_threads t
        where t.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
        group by 1, 2
    ) g

    union all

    select 'processing_cases_by_status'::text,
           json_build_object('status', g.status, 'cases', g.n)::text
    from (
        select c.status, count(*) as n
        from public.processing_cases c
        where c.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
        group by 1
    ) g

    union all

    -- THE LEAK CHECK. Any durable task row carrying a conversation or processing-case identity means
    -- a virtual projection was persisted -- the duplicate truth Work Items must never create.
    select 'virtual_source_durable_rows'::text,
           json_build_object(
               'task_id', t.id,
               'source', t.source,
               'status', t.status,
               'has_thread_key', (t.metadata ? 'communication_thread_id'),
               'has_case_key', (t.metadata ? 'processing_case_id')
           )::text
    from public.operational_tasks t
    where t.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      and (t.metadata ? 'communication_thread_id' or t.metadata ? 'processing_case_id')

    union all

    -- Org-wide task shape, so an empty leak check is read as "nothing leaked" rather than
    -- "nothing exists to leak".
    select 'tasks_total_by_source'::text,
           json_build_object('source', g.source, 'status', g.status, 'rows', g.n)::text
    from (
        select t.source, t.status, count(*) as n
        from public.operational_tasks t
        where t.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
        group by 1, 2
    ) g
) census
order by question_id, payload
