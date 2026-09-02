-- Where does Enrollment DECLARE that it begins, and what does that stage require?
--
-- CORRECTED PATH. An earlier run of this census read `requirement -> 'ref' ->> 'kind'` and reported
-- every requirement as kindless, which would have meant no Form requirement existed anywhere. That
-- was my query, not the data: `parseRefV1(row.kind, row)` shows `kind` is a TOP-LEVEL field on the
-- persisted row, and `ref` is the parsed in-memory shape that never touches the database. Reading a
-- shape the writer does not persist is a way to prove anything you like, so this reads `->>'kind'`.
--
-- Read-only. Stage keys, intent names, requirement kinds and counts. No requirement text, no form
-- names, no ids.
select question_id, 'data' as row_kind, payload
from (
    -- Every aggregating branch is a NESTED subquery: aggregating inside json_build_object in a UNION
    -- branch puts count(*) into that branch's own GROUP BY, which Postgres refuses.
    select 'entry_points'::text as question_id,
           json_build_object(
               'intent', g.intent,
               'declared_stage_key', g.declared_stage_key,
               'revisions', g.revisions
           )::text as payload
    from (
        select entry.key as intent,
               entry.value #>> '{}' as declared_stage_key,
               count(distinct rev.id) as revisions
        from public.business_process_revisions rev
        cross join lateral jsonb_array_elements(
            coalesce(jsonb_extract_path(rev.payload::jsonb, 'processes'), '[]'::jsonb)
        ) as proc(value)
        cross join lateral jsonb_each(
            coalesce(jsonb_extract_path(proc.value, 'entry_points_v1', 'by_intent'), '{}'::jsonb)
        ) as entry(key, value)
        where proc.value->>'key' = 'enrollment'
        group by 1, 2
    ) g

    union all

    -- What each stage requires, by kind, in the LATEST revision per department only. Counting across
    -- all 22 revisions multiplies one authored requirement by its publish history and would make
    -- "five" unreadable.
    select 'requirement_kinds_latest'::text,
           json_build_object(
               'stage_key', g.stage_key,
               'requirement_kind', g.requirement_kind,
               'requirements', g.n
           )::text
    from (
        select stage.value->>'key' as stage_key,
               coalesce(req.value->>'kind', '(none)') as requirement_kind,
               count(*) as n
        from (
            select distinct on (r.org_id, r.department_id) r.id, r.payload
            from public.business_process_revisions r
            order by r.org_id, r.department_id, r.revision_number desc
        ) rev
        cross join lateral jsonb_array_elements(
            coalesce(jsonb_extract_path(rev.payload::jsonb, 'processes'), '[]'::jsonb)
        ) as proc(value)
        cross join lateral jsonb_array_elements(
            coalesce(jsonb_extract_path(proc.value, 'stages'), '[]'::jsonb)
        ) as stage(value)
        cross join lateral jsonb_array_elements(
            coalesce(jsonb_extract_path(stage.value, 'requirements_v1', 'requirements'), '[]'::jsonb)
        ) as req(value)
        where proc.value->>'key' = 'enrollment'
        group by 1, 2
    ) g
) census
order by question_id, payload
