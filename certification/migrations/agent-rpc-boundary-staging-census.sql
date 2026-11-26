-- Read-only census: are the agent commit RPCs actually closed on staging?
--
-- `ledger: "applied"` is a label the apply action writes about itself. This asks
-- the database whether `authenticated` can still execute the functions that,
-- before this migration, let any signed-in session rewrite another
-- organization's configuration and forge the actor on the audit row.
--
-- Output contract: question_id | kind | payload, first branch aliased because a
-- UNION takes its column names from there.
--
-- `open_to_clients` returns rows only on FAILURE, so a total travels with it: an
-- empty answer must not be confusable with a census that queried nothing.
select question_id, kind, payload
from (
    select 'covered'::text as question_id,
           'proname'::text as kind,
           p.proname::text as payload,
           ('a' || p.proname)::text as sort_key
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname like 'agent\_v%\_commit\_%'

    union all

    -- Still callable from a browser session. Empty is the passing answer.
    select 'open_to_clients'::text, 'proname'::text, p.proname::text, ('m' || p.proname)::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname like 'agent\_v%\_commit\_%'
       and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            or has_function_privilege('anon', p.oid, 'EXECUTE'))

    union all

    -- Lost service_role: the routes would break. Empty is the passing answer.
    select 'lost_service_role'::text, 'proname'::text, p.proname::text, ('n' || p.proname)::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname like 'agent\_v%\_commit\_%'
       and not has_function_privilege('service_role', p.oid, 'EXECUTE')

    union all

    select 'covered_total'::text, 'count'::text, count(*)::text, 'zzz1'::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.proname like 'agent\_v%\_commit\_%'
) rows
order by sort_key;
