-- Which stage does each fixture journey sit in, and which stages actually carry Form requirements?
--
-- Path A realizes its participant objective; Path B reports "Stage enrollment requires no Forms".
-- Either the two paths enter different child stages, or the certified Form requirements are
-- configured on a stage other than the child entry stage. This reads both by evidence.
--
-- Requirements are NOT a table. They live inside the published Business Process revision payload
-- (payload -> processes[] -> stages[] -> requirements_v1.requirements[]), which is what
-- canonicalStageRequirements() reads at runtime -- so the census must read the payload the product
-- reads, or it would be measuring something the product never consults.
--
-- Read-only. Stage keys, requirement kinds and counts only; no names, no payload text.
select question_id, 'data' as row_kind, payload
from (
    -- Aggregating inside json_build_object in a UNION branch puts count(*) into that branch's own
    -- GROUP BY, which Postgres refuses -- so every aggregating branch is a NESTED subquery.
    select 'fixture_journeys'::text as question_id,
           json_build_object(
               'stage_key', g.stage_key,
               'context_type', g.context_type,
               'state', g.state,
               'intent', g.intent,
               'journeys', g.n
           )::text as payload
    from (
        select pi.stage_key, pi.context_type, pi.state, pi.metadata->>'source' as intent, count(*) as n
        from public.process_instances pi
        join public.customer_members cm on cm.id = pi.subject_id and cm.org_id = pi.org_id
        join public.customer_persons cp on cp.customer_id = cm.customer_id and cp.org_id = pi.org_id
        join public.persons p on p.id = cp.person_id and p.org_id = pi.org_id
        where pi.process_key = 'enrollment'
          and p.email like '%@enrollment-cert.alloy.invalid'
        group by 1, 2, 3, 4
    ) g

    union all

    -- Every stage the published revisions declare for the enrollment process, with how many
    -- requirements it states and how many of those are Forms. A stage that governs a journey but
    -- states zero Form requirements is exactly the Path B symptom.
    select 'revision_stage_requirements'::text,
           json_build_object(
               'stage_key', g.stage_key,
               'requirements', g.requirements,
               'form_requirements', g.form_requirements,
               'revisions', g.revisions
           )::text
    from (
        select stage.value->>'key' as stage_key,
               count(*) filter (where req.value is not null) as requirements,
               count(*) filter (where req.value->'ref'->>'kind' = 'form') as form_requirements,
               count(distinct rev.id) as revisions
        from public.business_process_revisions rev
        cross join lateral jsonb_array_elements(
            coalesce(jsonb_extract_path(rev.payload::jsonb, 'processes'), '[]'::jsonb)
        ) as proc(value)
        cross join lateral jsonb_array_elements(
            coalesce(jsonb_extract_path(proc.value, 'stages'), '[]'::jsonb)
        ) as stage(value)
        left join lateral jsonb_array_elements(
            coalesce(jsonb_extract_path(stage.value, 'requirements_v1', 'requirements'), '[]'::jsonb)
        ) as req(value) on true
        where proc.value->>'key' = 'enrollment'
        group by 1
    ) g

    union all

    -- Which revision each fixture journey is actually pinned to, so a stage with requirements in
    -- SOME revision cannot be mistaken for one that governs these journeys.
    select 'fixture_journey_revisions'::text,
           json_build_object(
               'stage_key', g.stage_key,
               'has_pinned_revision', g.has_pinned_revision,
               'journeys', g.n
           )::text
    from (
        select pi.stage_key,
               (pi.business_process_revision_id is not null) as has_pinned_revision,
               count(*) as n
        from public.process_instances pi
        join public.customer_members cm on cm.id = pi.subject_id and cm.org_id = pi.org_id
        join public.customer_persons cp on cp.customer_id = cm.customer_id and cp.org_id = pi.org_id
        join public.persons p on p.id = cp.person_id and p.org_id = pi.org_id
        where pi.process_key = 'enrollment'
          and p.email like '%@enrollment-cert.alloy.invalid'
        group by 1, 2
    ) g
) census
order by question_id, payload
