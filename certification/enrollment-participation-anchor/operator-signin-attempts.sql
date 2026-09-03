-- What does the auth service actually record for this operator's sign-in attempts?
--
-- Every structural explanation is now excluded by evidence: this lane's server and another working
-- lane's server authenticate against the SAME project (ikaxilmwmrmbagoidedu); this lane has no
-- change at all to the access, session or middleware surface (its only auth-surface diff is a
-- twenty-line dev-only hint on the login page); both /login pages render identically with no build
-- error; and the account kelly.kurzman@gmail.com is confirmed, unbanned, password-bearing, admin on
-- org 93667019-bd28-49b5-a688-acc9bb1e0a19, and last signed in today.
--
-- So stop inferring and read the record. auth.audit_log_entries is the auth service's own account of
-- what it was asked and what it answered.
--
-- Three things it can settle that nothing else can:
--   1. Whether attempts are ARRIVING at all. If none are recorded, the browser never reached this
--      project and the problem is in front of the auth service, not inside it.
--   2. What it answered -- a failed password, a rate limit, or something else entirely.
--   3. Whether an email identity row exists. An account can be confirmed, unbanned and
--      password-bearing and STILL be unable to sign in with a password without one, and that failure
--      is indistinguishable from a wrong password from the outside.
--
-- Reads timestamps, action names and counts. No password, no hash, no token, no session id.
select question_id, 'data' as row_kind, payload
from (
    select 'recent_auth_activity'::text as question_id,
           json_build_object(
               'action', g.action,
               'events', g.n,
               'first', g.first_at,
               'last', g.last_at
           )::text as payload
    from (
        select coalesce(a.payload->>'action', '(none)') as action,
               count(*) as n,
               min(a.created_at)::text as first_at,
               max(a.created_at)::text as last_at
        from auth.audit_log_entries a
        where a.created_at > now() - interval '12 hours'
        group by 1
    ) g

    union all

    -- Narrowed to this operator's address, so a busy project cannot hide their attempts.
    select 'operator_auth_activity'::text,
           json_build_object(
               'action', g.action,
               'events', g.n,
               'last', g.last_at
           )::text
    from (
        select coalesce(a.payload->>'action', '(none)') as action,
               count(*) as n,
               max(a.created_at)::text as last_at
        from auth.audit_log_entries a
        where a.created_at > now() - interval '12 hours'
          and lower(a.payload->>'actor_username') = 'kelly.kurzman@gmail.com'
        group by 1
    ) g

    union all

    -- The identity rows password sign-in resolves through.
    select 'operator_identities'::text,
           json_build_object('provider', g.provider, 'rows', g.n)::text
    from (
        select i.provider, count(*) as n
        from auth.identities i
        join auth.users u on u.id = i.user_id
        where lower(u.email) = 'kelly.kurzman@gmail.com'
        group by 1
    ) g

    union all

    -- Any near-miss duplicate of that address: case, whitespace, or a second account.
    select 'address_collisions'::text,
           json_build_object(
               'accounts_exact', count(*) filter (where u.email = 'kelly.kurzman@gmail.com'),
               'accounts_case_insensitive', count(*) filter (where lower(u.email) = 'kelly.kurzman@gmail.com'),
               'accounts_trimmed_match', count(*) filter (where lower(btrim(u.email)) = 'kelly.kurzman@gmail.com'),
               'accounts_like_kelly', count(*) filter (where u.email ilike '%kelly%')
           )::text
    from auth.users u
) census
order by question_id, payload
