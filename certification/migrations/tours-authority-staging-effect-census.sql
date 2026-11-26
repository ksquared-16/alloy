-- Read-only census: DID THE TOURS MIGRATION ACTUALLY LAND ON THE DEPLOYED DATABASE?
--
-- `database.apply_migration` returns `ledger: "applied"`, and that is a LABEL rather than evidence:
-- this programme has seen a ledger row without the effect and an effect without the row. So the
-- effect is measured directly — the two capabilities catalogued and active, the grants present for
-- admin and ops, and, the part that matters most, NO custom role holding either.
--
-- A distinct artifact from the package census filed earlier in this run, because
-- `database.read_census` replays a completed result for an identical query hash inside one
-- Execution Run (DATABASE_READ_CENSUS_CONTEXT_REUSE_DEFECT). Same run, different question, so
-- different bytes.
--
-- Output contract: question_id | kind | payload — the value must sit third or later.
select question_id, kind, payload
from (
    select 'catalog'::text as question_id, 'key'::text as kind,
           (pd.key || ' ~ active=' || pd.is_active::text || ' ~ group=' || coalesce(pd.group_key,'(null)'))::text as payload,
           ('1' || pd.key)::text as sort_key
    from public.permission_definitions pd
    where pd.key in ('tours.configure','tours.book')

    union all

    select 'grants', 'role_key',
           (g.role_key || ' ~ ' || g.permission_key || ' ~ orgs=' || count(distinct g.org_id)::text),
           '2' || g.role_key || g.permission_key
    from public.role_permission_grants g
    where g.permission_key in ('tours.configure','tours.book') and g.allowed
    group by g.role_key, g.permission_key

    union all

    -- THE ONE THAT WOULD BE A DEFECT. A new key must never land in a package nobody chose.
    select 'custom_holders', 'count', count(*)::text, '3a'
    from public.role_permission_grants g
    where g.permission_key in ('tours.configure','tours.book')
      and g.allowed and g.role_key not in ('admin','ops')

    union all

    -- COVERAGE: every seeded admin and ops role must hold both, with no duplicates.
    select 'coverage', 'seeded_roles', count(*)::text, '4a'
    from public.role_definitions rd where rd.role_key in ('admin','ops') and rd.is_active
    union all
    select 'coverage', 'grant_rows', count(*)::text, '4b'
    from public.role_definitions rd
    join public.role_permission_grants g
      on g.org_id = rd.org_id and g.role_key = rd.role_key and g.allowed
    where rd.role_key in ('admin','ops') and rd.is_active
      and g.permission_key in ('tours.configure','tours.book')

    union all

    -- AND THE LEDGER ROW, so "applied" can be checked rather than believed.
    select 'ledger', 'version', m.version::text, '5a'
    from supabase_migrations.schema_migrations m
    where m.version = '20260916020000'
) rows
order by sort_key;
