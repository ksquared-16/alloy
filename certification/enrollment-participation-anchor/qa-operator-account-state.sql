-- Can the documented QA operator account actually sign in right now?
--
-- The certification handoff records qa.operator@northwind.invalid signing in through the real login
-- form, and the identity census showed exactly one northwind.invalid account holding `admin` on the
-- certification org. If it is confirmed, unbanned and has a password set, it is the operator's
-- immediate route into localhost:3014 -- no account creation, no waiting.
--
-- This reads STATE, never the secret: whether a password hash exists, not what it is. The hash column
-- is only tested for null and emptiness and is never selected.
select question_id, 'data' as row_kind, payload
from (
    select 'qa_operator_state'::text as question_id,
           json_build_object(
               'accounts', count(*),
               'password_set', count(*) filter (where u.encrypted_password is not null
                                                  and u.encrypted_password <> ''),
               'email_confirmed', count(*) filter (where u.email_confirmed_at is not null),
               'banned_now', count(*) filter (where u.banned_until is not null and u.banned_until > now()),
               'last_sign_in', max(u.last_sign_in_at)::text,
               'password_last_changed', max(u.updated_at)::text
           )::text as payload
    from auth.users u
    where lower(u.email) = 'qa.operator@northwind.invalid'

    union all

    -- An email identity row is what password sign-in actually resolves through; an account without
    -- one is confirmed, unbanned, password-bearing and still unable to sign in.
    select 'qa_operator_identity_provider'::text,
           json_build_object('provider', g.provider, 'rows', g.n)::text
    from (
        select i.provider, count(*) as n
        from auth.identities i
        join auth.users u on u.id = i.user_id
        where lower(u.email) = 'qa.operator@northwind.invalid'
        group by 1
    ) g

    union all

    select 'qa_operator_org_access'::text,
           json_build_object(
               'roles', coalesce(string_agg(distinct r.role, ','), '(none)'),
               'certification_org_rows', count(*) filter (
                   where r.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19')
           )::text
    from public.user_roles r
    where r.user_id in (select id from auth.users where lower(email) = 'qa.operator@northwind.invalid')
) census
order by question_id, payload
