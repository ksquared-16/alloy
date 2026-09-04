-- Who owns the twelve participation-anchored journeys the fixture did not create?
--
-- The post-repair delta is clean on Opportunities but not on journeys: participation-anchored rose
-- from 2 to 14 while the certification fixture creates exactly 2 and its reset removed exactly 2.
-- "Every delta is fixture-owned" is the standard this certification is held to, so the remaining
-- twelve get attributed rather than assumed benign.
--
-- Splits them by whether the subject child belongs to the reserved certification namespace, and by
-- when they were created relative to the baseline snapshot (2026-09-02T16:49Z). A journey created
-- before the baseline that only now counts as participation-anchored was re-anchored by the
-- backfill migration, which is a different story from one minted since.
--
-- Read-only. Counts and buckets only; no names, no e-mails, no ids.
select question_id, 'data' as row_kind, payload
from (
    select 'participation_anchored_attribution'::text as question_id,
           json_build_object(
               'namespace', g.namespace,
               'created', g.created_bucket,
               'journeys', g.n
           )::text as payload
    from (
        select case when p.id is null then 'outside_fixture_namespace' else 'fixture_namespace' end as namespace,
               case when pi.created_at < timestamptz '2026-09-02T16:49:40Z' then 'before_baseline'
                    else 'since_baseline' end as created_bucket,
               count(*) as n
        from public.process_instances pi
        left join public.customer_members cm on cm.id = pi.subject_id and cm.org_id = pi.org_id
        left join public.customer_persons cp on cp.customer_id = cm.customer_id and cp.org_id = pi.org_id
        left join public.persons p on p.id = cp.person_id and p.org_id = pi.org_id
             and p.email like '%@enrollment-cert.alloy.invalid'
        where pi.process_key = 'enrollment'
          and pi.context_type = 'enrollment_participation'
        group by 1, 2
    ) g
) census
order by question_id, payload
