-- Read-only census: DID THE WORK MIGRATION LAND, AND DID THE ASYMMETRY SURVIVE?
--
-- `database.apply_migration` returns `ledger: "applied"`, which is a LABEL. The effect that matters
-- here is not just "both keys exist" but the SHAPE of the package: admin holds both, ops holds
-- `work.operate` and NOT `work.configure`, and no custom role holds either. A migration that created
-- the keys but flattened the asymmetry would report exactly the same label.
--
-- A distinct artifact from the package census filed earlier in this run, because
-- `database.read_census` replays a completed result for an identical query hash inside one
-- Execution Run (DATABASE_READ_CENSUS_CONTEXT_REUSE_DEFECT).
--
-- Output contract: question_id | kind | payload — the value must sit third or later.
select question_id, kind, payload
from (
    select 'catalog'::text as question_id, 'key'::text as kind,
           (pd.key || ' ~ active=' || pd.is_active::text || ' ~ group=' || coalesce(pd.group_key,'(null)'))::text as payload,
           ('1' || pd.key)::text as sort_key
    from public.permission_definitions pd
    where pd.key like 'work.%'

    union all

    -- THE ASYMMETRY. ops must appear for operate and NEVER for configure.
    select 'grants', 'role_key',
           (g.role_key || ' ~ ' || g.permission_key || ' ~ orgs=' || count(distinct g.org_id)::text),
           '2' || g.role_key || g.permission_key
    from public.role_permission_grants g
    where g.permission_key like 'work.%' and g.allowed
    group by g.role_key, g.permission_key

    union all

    select 'violations', 'ops_holds_configure', count(*)::text, '3a'
    from public.role_permission_grants g
    where g.permission_key = 'work.configure' and g.allowed and g.role_key <> 'admin'

    union all

    select 'violations', 'custom_holders', count(*)::text, '3b'
    from public.role_permission_grants g
    where g.permission_key like 'work.%' and g.allowed and g.role_key not in ('admin','ops')

    union all

    -- The two keys the Director ruled out by name must not exist at all.
    select 'violations', 'forbidden_keys', count(*)::text, '3c'
    from public.permission_definitions pd
    where pd.key in ('work.assign','work.manage')

    union all

    select 'coverage', 'admin_roles', count(*)::text, '4a'
    from public.role_definitions where role_key='admin' and is_active
    union all
    select 'coverage', 'ops_roles', count(*)::text, '4b'
    from public.role_definitions where role_key='ops' and is_active

    union all

    select 'ledger', 'version', m.version::text, '5a'
    from supabase_migrations.schema_migrations m
    where m.version = '20260916030000'
) rows
order by sort_key;
