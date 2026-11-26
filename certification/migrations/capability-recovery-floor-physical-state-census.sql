-- Read-only census: is the governed recovery floor really installed on the
-- target, and is it installed SAFELY?
--
-- Two questions, not one. "Did the function land" is the easy half; the half
-- that matters is whether the most powerful function in the Access model landed
-- behind the same execution boundary as everything else. The recovery owner
-- confers authority nobody currently holds — if it were reachable from a
-- browser it would be strictly worse than the defect PR #990 closed.
--
-- Every row asserts something only this migration produces, read from installed
-- objects and live ACLs rather than from files.
select question_id, kind, payload
from (
    -- 1. THE OWNER EXISTS.
    select 'm915170000'::text as question_id, 'check'::text as kind,
           ('recovery_floor ~ installed ~ owner_exists ~ '
            || coalesce((select (count(*) = 1)::text
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname='public' and p.proname='restore_capability_to_role'), 'false'))::text as payload,
           '1a'::text as sort_key
    union all

    -- 2. AND IT IS NOT REACHABLE BY AN ORDINARY CLIENT. The whole point.
    select 'm915170000', 'check',
           'recovery_floor ~ boundary ~ owner_not_client_executable ~ '
           || coalesce((select (NOT open_to_clients)::text
                        from public.access_rpc_boundary_report()
                       where proname='restore_capability_to_role'), 'false'),
           '1b'
    union all
    select 'm915170000', 'check',
           'recovery_floor ~ boundary ~ owner_keeps_service_role ~ '
           || coalesce((select has_service_role::text
                        from public.access_rpc_boundary_report()
                       where proname='restore_capability_to_role'), 'false'),
           '1c'
    union all

    -- 3. THE BOUNDARY REPORT IS STRUCTURAL NOW. It was keyed on `p_actor_user_id`,
    --    which the recovery owner does not take — so the old scan would have
    --    missed exactly the function that most needed covering. It now follows
    --    what a function DOES.
    select 'm915170000', 'check',
           'recovery_floor ~ boundary ~ scan_is_structural_and_covers_more ~ '
           || coalesce((select (count(*) >= 24)::text from public.access_rpc_boundary_report()), 'false'),
           '1d'
    union all
    select 'm915170000', 'check',
           'recovery_floor ~ boundary ~ nothing_open_to_clients ~ '
           || coalesce((select (count(*) = 0)::text from public.access_rpc_boundary_report()
                        where open_to_clients), 'false'),
           '1e'
    union all

    -- 4. THE PRECONDITIONS ARE IN THE INSTALLED BODY. A recovery owner without
    --    these is a grant-anything function wearing the right name.
    select 'm915170000', 'check',
           'recovery_floor ~ preconditions ~ refuses_memberless_target ~ '
           || coalesce((select (pg_get_functiondef(p.oid) like '%target_role_has_no_members%')::text
                        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and p.proname='restore_capability_to_role'), 'false'),
           '1f'
    union all
    select 'm915170000', 'check',
           'recovery_floor ~ preconditions ~ refuses_when_a_holder_exists ~ '
           || coalesce((select (pg_get_functiondef(p.oid) like '%recovery_no_longer_required%')::text
                        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and p.proname='restore_capability_to_role'), 'false'),
           '1g'
    union all
    select 'm915170000', 'check',
           'recovery_floor ~ preconditions ~ refuses_inactive_capability ~ '
           || coalesce((select (pg_get_functiondef(p.oid) like '%capability_not_active%')::text
                        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and p.proname='restore_capability_to_role'), 'false'),
           '1h'
    union all
    select 'm915170000', 'check',
           'recovery_floor ~ preconditions ~ asserts_a_holder_results ~ '
           || coalesce((select (pg_get_functiondef(p.oid) like '%recovery_produced_no_holder%')::text
                        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and p.proname='restore_capability_to_role'), 'false'),
           '1i'
    union all

    -- 5. THE NORMAL CEILINGS ARE UNTOUCHED. An exception that quietly relaxed the
    --    rule it excepts would be the worst possible outcome of this work.
    select 'm915170000', 'check',
           'recovery_floor ~ regression ~ w18_grant_ceiling_intact ~ '
           || coalesce((select (pg_get_functiondef('public.replace_role_permission_grants(uuid,text,text[],text,text,text)'::regprocedure)
                                like '%delegation_ceiling:%')::text), 'false'),
           '1j'
    union all
    select 'm915170000', 'check',
           'recovery_floor ~ regression ~ assignment_ceiling_intact ~ '
           || coalesce((select (pg_get_functiondef('public.assign_member_role_audited(uuid,uuid,text,text,text,text)'::regprocedure)
                                like '%assert_assignment_delegation_ceiling%')::text), 'false'),
           '1k'

    union all
    select 'ledger_version', 'row',
           v.version || ' ~ registered ~ '
           || (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                    then 'present' else 'absent' end)
           || ' ~ '
           || exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)::text,
           '3' || v.version
    from (values ('20260915170000')) as v(version)
    union all
    select 'ledger_head', 'value',
           (select coalesce(max(version), 'none') from supabase_migrations.schema_migrations), '4'
) rows
order by sort_key;
