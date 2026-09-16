-- WORK AUTHORITY V1 CLOSEOUT — independent effect census of 20260916030000.
--
-- The apply action returned ok=true / ledger="applied". That is its own success label,
-- and the instruction is explicit that it is not the effect proof. This census measures
-- the deployed world directly, and it asks the questions the earlier effect census did
-- NOT ask: EXACTLY-ONCE (not merely "present"), ledger duplication and ordering, the
-- live seed_default_rbac package region, revoked-but-present grants, and the FULL role
-- inventory rather than the two roles I expected to find.
--
-- "Exactly once" matters because a re-run or a version collision can leave a second
-- definition row that every presence check reads as green.
--
-- Output contract: question_id | kind | payload — the value must sit third or later.
select question_id, kind, payload from (

    -- w1: EXACTLY ONCE, not merely present.
    select 'w1_exactly_once'::text as question_id, 'configure_active'::text as kind,
           count(*)::text as payload, '1a'::text as sort_key
    from public.permission_definitions where key='work.configure' and is_active
    union all select 'w1_exactly_once','configure_any', count(*)::text,'1b'
    from public.permission_definitions where key='work.configure'
    union all select 'w1_exactly_once','operate_active', count(*)::text,'1c'
    from public.permission_definitions where key='work.operate' and is_active
    union all select 'w1_exactly_once','operate_any', count(*)::text,'1d'
    from public.permission_definitions where key='work.operate'
    union all select 'w1_exactly_once','work_star_total', count(*)::text,'1e'
    from public.permission_definitions where key like 'work.%'

    -- w2: FULL role inventory holding any work.* grant. Not a two-role assumption.
    union all select 'w2_holders', rd.role_key,
           (rd.role_key || ' ~ is_system=' || coalesce(rd.is_system::text,'?')
            || ' ~ configure=' || count(*) filter (where g.permission_key='work.configure' and g.allowed)::text
            || ' ~ operate='   || count(*) filter (where g.permission_key='work.operate'   and g.allowed)::text
            || ' ~ orgs='      || count(distinct rd.org_id)::text), '2' || rd.role_key
    from public.role_definitions rd
    left join public.role_permission_grants g
           on g.org_id=rd.org_id and g.role_key=rd.role_key and g.permission_key like 'work.%'
    where rd.is_active
    group by rd.role_key, rd.is_system

    -- w3: the asymmetry, per org, stated as a violation count in BOTH directions.
    union all select 'w3_asymmetry','orgs_missing_admin_configure', count(*)::text,'3a'
    from public.role_definitions rd where rd.role_key='admin' and rd.is_active
      and not exists (select 1 from public.role_permission_grants g where g.org_id=rd.org_id
        and g.role_key='admin' and g.permission_key='work.configure' and g.allowed)
    union all select 'w3_asymmetry','orgs_missing_admin_operate', count(*)::text,'3b'
    from public.role_definitions rd where rd.role_key='admin' and rd.is_active
      and not exists (select 1 from public.role_permission_grants g where g.org_id=rd.org_id
        and g.role_key='admin' and g.permission_key='work.operate' and g.allowed)
    union all select 'w3_asymmetry','orgs_missing_ops_operate', count(*)::text,'3c'
    from public.role_definitions rd where rd.role_key='ops' and rd.is_active
      and not exists (select 1 from public.role_permission_grants g where g.org_id=rd.org_id
        and g.role_key='ops' and g.permission_key='work.operate' and g.allowed)
    union all select 'w3_asymmetry','orgs_where_ops_HAS_configure', count(*)::text,'3d'
    from public.role_permission_grants g
    where g.role_key='ops' and g.permission_key='work.configure' and g.allowed
    union all select 'w3_asymmetry','non_admin_holds_configure', count(*)::text,'3e'
    from public.role_permission_grants g
    where g.permission_key='work.configure' and g.allowed and g.role_key<>'admin'

    -- w4: revoked-but-present rows. A presence check reads allowed=false as absent.
    union all select 'w4_revoked','work_grants_allowed_false', count(*)::text,'4a'
    from public.role_permission_grants where permission_key like 'work.%' and not allowed

    -- w5: the two keys ruled out by name must not exist in any form.
    union all select 'w5_forbidden','assign_or_manage_defs', count(*)::text,'5a'
    from public.permission_definitions where key in ('work.assign','work.manage')
    union all select 'w5_forbidden','assign_or_manage_grants', count(*)::text,'5b'
    from public.role_permission_grants where permission_key in ('work.assign','work.manage')

    -- w6: migration identity EXACTLY once, and the ledger's own health.
    union all select 'w6_ledger','identity_20260916030000', count(*)::text,'6a'
    from supabase_migrations.schema_migrations where version='20260916030000'
    union all select 'w6_ledger','duplicate_versions', count(*)::text,'6b'
    from (select version from supabase_migrations.schema_migrations
          group by version having count(*)>1) dup
    union all select 'w6_ledger','head', max(version)::text,'6c'
    from supabase_migrations.schema_migrations
    union all select 'w6_ledger','total', count(*)::text,'6d'
    from supabase_migrations.schema_migrations
    union all select 'w6_ledger','out_of_order_after_head', count(*)::text,'6e'
    from supabase_migrations.schema_migrations where version > '20260916030000'

    -- w7: the LIVE seed function's package region — what a NEW org would be born holding.
    -- Read from pg_get_functiondef, so this is the deployed body, not the repo's copy.
    union all select 'w7_seed_fn','admin_region_names_configure',
           (position('''work.configure''' in substr(d.src, position('W12:ADMIN-GRANTS:BEGIN' in d.src),
                position('W12:ADMIN-GRANTS:END' in d.src) - position('W12:ADMIN-GRANTS:BEGIN' in d.src))) > 0)::text,'7a'
    from (select pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure) as src) d
    union all select 'w7_seed_fn','admin_region_names_operate',
           (position('''work.operate''' in substr(d.src, position('W12:ADMIN-GRANTS:BEGIN' in d.src),
                position('W12:ADMIN-GRANTS:END' in d.src) - position('W12:ADMIN-GRANTS:BEGIN' in d.src))) > 0)::text,'7b'
    from (select pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure) as src) d
    union all select 'w7_seed_fn','ops_region_names_operate',
           (position('''work.operate''' in substr(d.src, position('W12:OPS-GRANTS:BEGIN' in d.src),
                position('W12:OPS-GRANTS:END' in d.src) - position('W12:OPS-GRANTS:BEGIN' in d.src))) > 0)::text,'7c'
    from (select pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure) as src) d
    -- MUST be false. A new org must not be born able to configure work as ops.
    union all select 'w7_seed_fn','ops_region_names_configure_MUST_BE_FALSE',
           (position('''work.configure''' in substr(d.src, position('W12:OPS-GRANTS:BEGIN' in d.src),
                position('W12:OPS-GRANTS:END' in d.src) - position('W12:OPS-GRANTS:BEGIN' in d.src))) > 0)::text,'7d'
    from (select pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure) as src) d

    -- w8: org population, so a zero above can be told apart from an empty world.
    union all select 'w8_population','orgs_total', count(*)::text,'8a' from public.orgs
    union all select 'w8_population','active_roles_total', count(*)::text,'8b'
    from public.role_definitions where is_active
) rows order by sort_key;
