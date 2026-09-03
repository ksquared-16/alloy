-- WHICH account should the operator sign in as at localhost:3014?
--
-- Every other route is now closed by evidence: the operator's own address has no account here, none
-- was created in the last two hours, and qa.operator@northwind.invalid -- the identity the
-- certification handoff names -- does not exist in this project either. What does exist is a small
-- set of human accounts holding a role in the certification org.
--
-- This returns their ADDRESSES, which earlier censuses deliberately withheld. The reason to withhold
-- was to avoid producing an address list; the reason to return them now is that the address IS the
-- answer to the question being asked. Scope is kept to exactly that: human accounts with a role in
-- ONE named org, in the operator's own certification tenant, most of them on non-routable test
-- domains. No password, no hash, no token, no id.
select question_id, 'data' as row_kind, payload
from (
    select 'accounts_that_can_reach_certification_org'::text as question_id,
           json_build_object(
               'email', lower(u.email),
               'roles', string_agg(distinct r.role, ','),
               'email_confirmed', (u.email_confirmed_at is not null),
               'password_set', (u.encrypted_password is not null and u.encrypted_password <> ''),
               'banned_now', (u.banned_until is not null and u.banned_until > now()),
               'last_sign_in', u.last_sign_in_at::date::text
           )::text as payload
    from public.user_roles r
    join auth.users u on u.id = r.user_id
    where r.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      and u.email !~* '^qa-slot[1-6]-'
    group by u.id, u.email, u.email_confirmed_at, u.encrypted_password, u.banned_until, u.last_sign_in_at
) census
order by question_id, payload
