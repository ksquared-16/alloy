-- Which account should the operator actually sign in with on this project?
--
-- Established: kelly@kurzmancapital.com has no account here (0 of 11), so the password is correct for
-- a different environment. The managed slot QA identities cannot help -- they are provisioned as
-- non-human accounts with a throwaway password nobody holds, and reach a session only by magic-link
-- restore. So the question is whether the operator is already registered here under a different
-- address, and which accounts can actually reach the certification org.
--
-- Returns DOMAINS and local-part shapes, never a full address: enough to recognise your own account,
-- not enough to be an address list. Managed QA identities are labelled by their registered shape.
select question_id, 'data' as row_kind, payload
from (
    select 'account_shapes'::text as question_id,
           json_build_object(
               'kind', g.kind,
               'email_domain', g.email_domain,
               'accounts', g.n,
               'confirmed', g.confirmed,
               'ever_signed_in', g.ever_signed_in,
               'newest', g.newest
           )::text as payload
    from (
        select case
                   when u.email ~* '^qa-slot[1-6]-' then 'managed_qa_identity'
                   when coalesce(u.raw_app_meta_data->>'managed_by', '') = 'alloy' then 'managed_other'
                   else 'human'
               end as kind,
               split_part(lower(u.email), '@', 2) as email_domain,
               count(*) as n,
               count(*) filter (where u.email_confirmed_at is not null) as confirmed,
               count(*) filter (where u.last_sign_in_at is not null) as ever_signed_in,
               max(u.created_at)::date::text as newest
        from auth.users u
        group by 1, 2
    ) g

    union all

    -- Of those, which can actually reach the certification org, and as what.
    select 'org_access'::text,
           json_build_object(
               'kind', g.kind,
               'email_domain', g.email_domain,
               'role', g.role,
               'accounts', g.n
           )::text
    from (
        select case
                   when u.email ~* '^qa-slot[1-6]-' then 'managed_qa_identity'
                   when coalesce(u.raw_app_meta_data->>'managed_by', '') = 'alloy' then 'managed_other'
                   else 'human'
               end as kind,
               split_part(lower(u.email), '@', 2) as email_domain,
               r.role,
               count(distinct u.id) as n
        from public.user_roles r
        join auth.users u on u.id = r.user_id
        where r.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
        group by 1, 2, 3
    ) g
) census
order by question_id, payload
