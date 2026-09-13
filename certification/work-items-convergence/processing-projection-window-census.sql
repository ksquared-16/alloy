-- Is the Processing → Work Items projection cohort a PRODUCT DECISION, or a PAGE BOUNDARY?
--
-- The reported hosted evidence: 6 Processing cases at `needs_resolution`, none of them projected
-- into Work Items, and all 19 projected rows at `received`. Read one way that says "only `received`
-- is actionable". Read another way it says "the projection only ever saw the newest 25 cases".
--
-- Those two readings demand completely different repairs, and only the database can separate them.
--
-- The claim under test: `warmProcessingQueueCache` fetched `/api/admin/processing/queue` with no
-- parameters, so `buildProcessingQueueRequest` produced `statuses: undefined` and
-- `limit: DEFAULT_QUEUE_LIMIT` (25), ordered `created_at desc, id desc`. If that is right, then the
-- newest 25 cases contain ZERO `needs_resolution` rows while the tenant holds six, and each of the
-- six sits at a page rank beyond 25. That is a fact about ordering, not about semantics.
--
-- Q3 is the decisive question. Q4 names the ranks so the answer cannot be a coincidence of counts.
--
-- Read-only. Counts, statuses, ids and timestamps only -- no document contents, no form answers,
-- no person, child or family data, no free text.

select question_id, 'data' as row_kind, payload
from (
    -- Q1. Does this tenant exist and hold Processing cases at all? Without this, an all-zero census
    -- reads as "empty tenant" when it may only mean "wrong org id".
    select 'org_exists'::text as question_id,
           json_build_object(
               'org_id_found', exists (
                   select 1 from public.organizations o
                   where o.id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
               ),
               'processing_cases_total', (
                   select count(*) from public.processing_cases c
                   where c.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
               )
           )::text as payload

    union all

    -- Q2. The whole-tenant status distribution. Establishes how many `needs_resolution` cases exist
    -- independently of any page.
    select 'cases_by_status'::text,
           json_build_object('status', g.status, 'cases', g.n)::text
    from (
        select c.status, count(*) as n
        from public.processing_cases c
        where c.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
        group by 1
    ) g

    union all

    -- Q3. THE DECISIVE QUESTION.
    --
    -- The status mix of the newest 25 cases -- reproducing the unparameterized queue read exactly:
    -- no status filter, limit 25, `created_at desc, id desc`. If `needs_resolution` is absent here
    -- while Q2 reports six of them, the cohort was never a decision about actionability. It was the
    -- page boundary, and the projection simply never saw those rows.
    select 'default_page_status_mix'::text,
           json_build_object('status', g.status, 'cases_on_default_page', g.n)::text
    from (
        select p.status, count(*) as n
        from (
            select c.status
            from public.processing_cases c
            where c.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
            order by c.created_at desc, c.id desc
            limit 25
        ) p
        group by 1
    ) g

    union all

    -- Q4. Where each non-`received` actionable case actually falls in that ordering.
    --
    -- A rank greater than 25 is the truncation, named case by case. A rank of 25 or less would
    -- falsify the claim outright and send the repair back to semantics.
    select 'actionable_case_page_rank'::text,
           json_build_object(
               'case_id', r.id,
               'status', r.status,
               'page_rank', r.rn,
               'inside_default_page', (r.rn <= 25),
               'created_at', r.created_at,
               'status_changed_at', r.status_changed_at
           )::text
    from (
        select c.id,
               c.status,
               c.created_at,
               c.status_changed_at,
               row_number() over (order by c.created_at desc, c.id desc) as rn
        from public.processing_cases c
        where c.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
    ) r
    where r.status in ('needs_resolution', 'needs_review', 'processing')

    union all

    -- Q5. How large the actionable cohort really is, so the replacement read's limit is sized
    -- against the tenant rather than guessed. `ready`, `completed` and `archived` are excluded:
    -- `ready` is a Studio authoring step and the other two are terminal.
    select 'actionable_cohort_size'::text,
           json_build_object(
               'actionable_cases', (
                   select count(*) from public.processing_cases c
                   where c.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
                     and c.status in ('received', 'processing', 'needs_review', 'needs_resolution')
               ),
               'terminal_cases', (
                   select count(*) from public.processing_cases c
                   where c.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
                     and c.status in ('completed', 'archived')
               )
           )::text

    union all

    -- Q6. THE LEAK CHECK, restated for this repair.
    --
    -- The projection must stay virtual. Any durable `operational_tasks` row carrying a
    -- processing-case identity would be the duplicate persistence the doctrine forbids -- and
    -- widening the cohort is exactly the change that would expose such a leak if one existed.
    select 'processing_projection_durable_rows'::text,
           json_build_object(
               'task_id', t.id,
               'source', t.source,
               'status', t.status,
               'has_case_key', (t.metadata ? 'processing_case_id')
           )::text
    from public.operational_tasks t
    where t.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      and t.metadata ? 'processing_case_id'

    union all

    -- Q7. Durable task totals, so an empty Q6 reads as "nothing leaked" rather than "nothing exists".
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
