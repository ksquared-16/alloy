-- Re-check, after the operator reported still being unable to sign in.
--
-- Separate file from qa-login-account-census.sql on purpose: the census runner caches by query hash,
-- so re-sending an identical query returns the earlier reading no matter what changed in between.
-- That already caught me out once on the certification delta; a stale "no account" here would send
-- this diagnosis in exactly the wrong direction.
--
-- Returns booleans, dates and counts. No e-mail address, no id, nothing resembling a credential.
select question_id, 'data' as row_kind, payload
from (
    select 'operator_account_now'::text as question_id,
           json_build_object(
               'accounts_matching', count(*),
               'has_password_set', count(*) filter (where u.encrypted_password is not null
                                                      and u.encrypted_password <> ''),
               'email_confirmed', count(*) filter (where u.email_confirmed_at is not null),
               'banned', count(*) filter (where u.banned_until is not null and u.banned_until > now()),
               'ever_signed_in', count(*) filter (where u.last_sign_in_at is not null),
               'created_on', max(u.created_at)::text
           )::text as payload
    from auth.users u
    where lower(u.email) = 'kelly@kurzmancapital.com'

    union all

    select 'operator_org_access_now'::text,
           json_build_object(
               'role_rows', count(*),
               'orgs', count(distinct r.org_id),
               'roles', coalesce(string_agg(distinct r.role, ','), '(none)'),
               'has_certification_org', count(*) filter (
                   where r.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19')
           )::text
    from public.user_roles r
    where r.user_id in (select u.id from auth.users u where lower(u.email) = 'kelly@kurzmancapital.com')

    union all

    -- Any account created in this project in the last two hours, by kind. If the operator created one
    -- under a different address, this shows that a creation happened without naming it.
    select 'recent_account_creation'::text,
           json_build_object(
               'kind', g.kind,
               'accounts_created_last_2h', g.n
           )::text
    from (
        select case when u.email ~* '^qa-slot[1-6]-' then 'managed_qa_identity' else 'human' end as kind,
               count(*) as n
        from auth.users u
        where u.created_at > now() - interval '2 hours'
        group by 1
    ) g
) census
order by question_id, payload
