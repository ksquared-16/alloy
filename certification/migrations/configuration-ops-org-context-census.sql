-- Read-only census: are the two ops roles failing the CONFIGAUTH self-test attached to live tenants?
--
-- The provenance census established WHAT they are: both ops roles hold none of the three manage
-- keys, every one NEVER_GRANTED with zero audit events, while admin in the same orgs holds all
-- three. Nothing was lost, so the assertion's wording does not describe them.
--
-- What it could not say is whether bringing them up to the canonical default package would widen a
-- LIVE tenant's authority or merely complete a dormant one. That is the difference between a policy
-- decision and a cleanup, so it is asked separately rather than assumed.
--
-- Org slug and counts only; no user identity is read.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
select question_id, kind, payload
from (
    select 'org_context'::text, 'context'::text,
           (o.id::text || ' ~ ' || coalesce(o.slug,'(no slug)')
            || ' ~ created=' || o.created_at::date::text
            || ' ~ roles=' || (select count(*) from public.role_definitions rd where rd.org_id = o.id)::text
            || ' ~ ops_active=' || (select count(*) from public.role_definitions rd
                                     where rd.org_id = o.id and rd.role_key = 'ops' and rd.is_active)::text
            || ' ~ users_with_roles=' || (select count(distinct ur.user_id) from public.user_roles ur where ur.org_id = o.id)::text
            || ' ~ ops_principals=' || (select count(distinct ur.user_id) from public.user_roles ur
                                         where ur.org_id = o.id and ur.role = 'ops')::text
            || ' ~ ops_grants_total=' || (select count(*) from public.role_permission_grants g
                                           where g.org_id = o.id and g.role_key = 'ops' and g.allowed)::text)::text,
           'a_' || o.id::text
    from public.orgs o
    where o.id in ('7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
                   '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid)

    union all
    -- The org whose ops role DOES pass, for comparison: what a complete ops package looks like here.
    select 'passing_org_context'::text, 'context'::text,
           (o.id::text || ' ~ ' || coalesce(o.slug,'(no slug)')
            || ' ~ created=' || o.created_at::date::text
            || ' ~ ops_grants_total=' || (select count(*) from public.role_permission_grants g
                                           where g.org_id = o.id and g.role_key = 'ops' and g.allowed)::text
            || ' ~ ops_principals=' || (select count(distinct ur.user_id) from public.user_roles ur
                                         where ur.org_id = o.id and ur.role = 'ops')::text)::text,
           'b_' || o.id::text
    from public.orgs o
    where o.id not in ('7803388d-cdee-4afb-89cf-23a137f39423'::uuid,
                       '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid)

    union all
    select 'nonvacuity'::text, 'guard'::text,
           ('orgs_total=' || (select count(*) from public.orgs)::text
            || ' user_roles_total=' || (select count(*) from public.user_roles)::text)::text,
           'zz0'::text
) q(question_id, kind, payload, sort_key)
order by sort_key;
