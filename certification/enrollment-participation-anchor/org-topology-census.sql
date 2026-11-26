-- Which org holds the Enrollment certification data, and which org is the QA operator in?
--
-- The certification fixture failed closed with "no Create Lead entry department resolves for this
-- org" against the org the QA identity was granted (93667019...). The tenant has two orgs and 25
-- Enrollment journeys, and the assign-access action reported candidate_orgs_seen=2 choosing the
-- "configured" one -- so the operator and the data may simply be in different orgs. That is a
-- question about topology, not about Enrollment, and it is answered here rather than guessed.
--
-- Ids only for orgs, which an operator must be able to name. No person, child or family content.
select question_id, 'data' as row_kind, payload
from (
    select 'orgs'::text as question_id,
           json_build_object('org_id', o.id, 'name', o.name)::text as payload
    from public.orgs o

    union all

    select 'journeys_by_org'::text,
           json_build_object('org_id', g.org_id, 'journeys', g.n)::text
    from (
        select pi.org_id, count(*) as n
        from public.process_instances pi
        where pi.process_key = 'enrollment' and pi.subject_type = 'child'
        group by pi.org_id
    ) g

    union all

    -- Create Lead entry configuration is what the fixture needs; departments carry it.
    select 'departments_by_org'::text,
           json_build_object('org_id', g.org_id, 'departments', g.n)::text
    from (select d.org_id, count(*) as n from public.departments d group by d.org_id) g

    union all

    select 'members_by_org'::text,
           json_build_object('org_id', g.org_id, 'user_roles', g.n)::text
    from (select ur.org_id, count(*) as n from public.user_roles ur group by ur.org_id) g
) census
order by question_id, payload
