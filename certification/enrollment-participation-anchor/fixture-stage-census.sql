-- Which stage does each fixture journey actually sit in, and where are the Form requirements?
--
-- Path A realizes its participant objective; Path B reports "Stage enrollment requires no Forms".
-- If the two paths enter DIFFERENT child stages that is a configuration split worth seeing, because
-- one Enrollment product should not have two entry stages. Counts, stage keys and intents only.
select question_id, 'data' as row_kind, payload
from (
    select 'fixture_journeys'::text as question_id,
           json_build_object(
               'stage_key', pi.stage_key,
               'context_type', pi.context_type,
               'state', pi.state,
               'intent', pi.metadata->>'source',
               'journeys', count(*)
           )::text as payload
    from public.process_instances pi
    join public.customer_members cm on cm.id = pi.subject_id and cm.org_id = pi.org_id
    join public.customer_persons cp on cp.customer_id = cm.customer_id and cp.org_id = pi.org_id
    join public.persons p on p.id = cp.person_id and p.org_id = pi.org_id
    where pi.process_key = 'enrollment'
      and p.email like '%@enrollment-cert.alloy.invalid'
    group by 1,2,3,4

    union all

    -- Where the configured stage requirements actually live, by stage.
    select 'stage_requirements'::text,
           json_build_object('stage_key', g.stage_key, 'requirements', g.n)::text
    from (
        select r.stage_key, count(*) as n
        from public.business_process_stage_requirements r
        group by r.stage_key
    ) g
) census
order by question_id, payload
