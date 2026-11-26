-- Why does a confirmed-correct password fail at localhost:3014?
--
-- The plumbing is already cleared: the server holds NEXT_PUBLIC_SUPABASE_URL, the anon key and the
-- service role key; the anon key's `ref` claim matches the project host; and an auth probe with no
-- user credentials returned 400 invalid_credentials rather than 401 invalid_api_key -- so the key was
-- ACCEPTED and the account lookup is what failed. That rules out configuration and points at the
-- account itself.
--
-- The likely story is environments: this server points at the certification project, and an operator
-- signing in with the password they use elsewhere would be presenting it to a project that has never
-- seen it. This settles that by evidence.
--
-- Returns booleans, dates and counts. NO e-mail address, no id, and nothing resembling a credential
-- is selected -- the address appears only in the WHERE clause, to identify whose account this is.
select question_id, 'data' as row_kind, payload
from (
    select 'operator_account'::text as question_id,
           json_build_object(
               'accounts_matching', count(*),
               'has_password_set', count(*) filter (where u.encrypted_password is not null
                                                      and u.encrypted_password <> ''),
               'email_confirmed', count(*) filter (where u.email_confirmed_at is not null),
               'banned', count(*) filter (where u.banned_until is not null and u.banned_until > now()),
               'ever_signed_in', count(*) filter (where u.last_sign_in_at is not null),
               'created_on', min(u.created_at)::date::text
           )::text as payload
    from auth.users u
    where lower(u.email) = 'kelly@kurzmancapital.com'

    union all

    -- Even a valid sign-in lands nowhere without membership; this is the second gate, checked now so
    -- a fix for the first does not simply reveal the second.
    select 'operator_org_membership'::text,
           json_build_object(
               'role_rows', count(*),
               'orgs', count(distinct r.org_id),
               'roles', coalesce(string_agg(distinct r.role, ','), '(none)')
           )::text
    from public.user_roles r
    where r.user_id in (select u.id from auth.users u where lower(u.email) = 'kelly@kurzmancapital.com')

    union all

    -- How many accounts this project holds at all. One or two would say it is a fresh certification
    -- project that never held the operator's everyday account.
    select 'project_account_population'::text,
           json_build_object('total_accounts', count(*))::text
    from auth.users
) census
order by question_id, payload
