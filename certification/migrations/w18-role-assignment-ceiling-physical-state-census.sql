-- Read-only census: did 20260915150000_w18_role_assignment_ceiling take on the
-- target, or does the ledger merely say so?
--
-- The stake is one-directional again: the code ships at merge and the schema
-- follows. Until this migration is really applied, staging serves routes that
-- believe membership is bounded while the database confers whole role packages
-- to anyone holding admin.users.write. A reported apply is a statement about the
-- runner; a version collision yields a silent FALSE SKIP.
--
-- Every row asserts something only THIS migration produces, read out of the
-- INSTALLED function sources rather than from a file, so a database that never
-- received it cannot answer true.
select question_id, kind, payload
from (
    -- 1. THE CEILING FUNCTION ITSELF, and the two resolvers it measures with.
    select 'm915150000'::text as question_id, 'check'::text as kind,
           ('functions ~ installed ~ ceiling_and_its_resolvers ~ '
            || coalesce((select (count(*) = 3)::text
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public'
                          and p.proname in ('assert_assignment_delegation_ceiling',
                                            'effective_capability_keys',
                                            'capability_keys_of_roles')), 'false'))::text as payload,
           '1a'::text as sort_key
    union all

    -- 2. EVERY WRITER THAT CAN INCREASE AUTHORITY CALLS IT. Read from the
    --    installed body: a function that stopped calling the ceiling is the whole
    --    defect returning, and it would not show up in any file-based check.
    select 'm915150000', 'check',
           'assign_member_role_audited ~ bounded ~ calls_the_ceiling ~ '
           || coalesce((select (pg_get_functiondef(p.oid) like '%assert_assignment_delegation_ceiling%')::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname='public' and p.proname='assign_member_role_audited'), 'false'),
           '1b'
    union all
    select 'm915150000', 'check',
           'replace_membership_with_access_profile ~ bounded ~ calls_the_ceiling ~ '
           || coalesce((select (pg_get_functiondef(p.oid) like '%assert_assignment_delegation_ceiling%')::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname='public' and p.proname='replace_membership_with_access_profile'), 'false'),
           '1c'
    union all
    select 'm915150000', 'check',
           'create_membership_with_access_profile ~ bounded ~ calls_the_ceiling ~ '
           || coalesce((select (pg_get_functiondef(p.oid) like '%assert_assignment_delegation_ceiling%')::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname='public' and p.proname='create_membership_with_access_profile'), 'false'),
           '1d'
    union all

    -- 3. THE UNBOUNDED OVERLOAD IS GONE. A surviving three-argument
    --    `create_membership_with_access_profile` is not a compatibility measure,
    --    it is the bypass — so its ABSENCE is the assertion, not the new one's
    --    presence.
    select 'm915150000', 'check',
           'create_membership_with_access_profile ~ overload ~ unbounded_three_arg_absent ~ '
           || coalesce((select (count(*) = 0)::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname='public' and p.proname='create_membership_with_access_profile'
                         and p.pronargs = 3), 'false'),
           '1e'
    union all
    select 'm915150000', 'check',
           'create_membership_with_access_profile ~ overload ~ exactly_one_signature ~ '
           || coalesce((select (count(*) = 1)::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname='public' and p.proname='create_membership_with_access_profile'), 'false'),
           '1f'
    union all

    -- 4. REDUCTION IS DELIBERATELY UNBOUNDED. If these ever started calling the
    --    ceiling, an administrator could no longer remove a role richer than
    --    their own and every over-provisioned member would become permanent. The
    --    absence here is a decision, so it is asserted like one.
    select 'm915150000', 'check',
           'remove_member_role_audited ~ reduction ~ deliberately_unbounded ~ '
           || coalesce((select (pg_get_functiondef(p.oid) not like '%assert_assignment_delegation_ceiling%')::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname='public' and p.proname='remove_member_role_audited'), 'false'),
           '1g'
    union all

    -- 5. THE GRANT CEILING SURVIVED. This migration does not touch W-18's own
    --    function, but a census that only proves the new half would miss the
    --    regression that matters most.
    select 'm915150000', 'check',
           'replace_role_permission_grants ~ w18 ~ grant_ceiling_survives ~ '
           || coalesce((select (pg_get_functiondef('public.replace_role_permission_grants(uuid,text,text[],text,text,text)'::regprocedure)
                                like '%delegation_ceiling:%')::text), 'false'),
           '1h'

    union all
    select 'ledger_version', 'row',
           v.version || ' ~ registered ~ '
           || (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                    then 'present' else 'absent' end)
           || ' ~ '
           || exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)::text,
           '3' || v.version
    from (values ('20260915150000')) as v(version)
    union all
    select 'ledger_head', 'value',
           (select coalesce(max(version), 'none') from supabase_migrations.schema_migrations), '4'
) rows
order by sort_key;
