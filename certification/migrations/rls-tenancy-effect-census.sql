-- RLS TENANCY REPAIR V1 — independent effect proof of 20260916040000 on the deployed database.
--
-- The apply returned ok=true / ledger="applied". That is its own success label. What has to be true
-- is narrower and is checked in BOTH directions here: the dead predicate gone, the tautologies gone,
-- no capability smuggled into a policy, and — the one that matters most — no table left reachable
-- because its policies were removed while RLS was off.
--
-- A migration that dropped the policies AND disabled RLS somewhere would report the same label.
--
-- Output contract: question_id | kind | payload.
select question_id, kind, payload from (

    -- e1: the defect, measured as the migration's own self-test measures it.
    select 'e1_defect'::text as question_id, 'dead_identity_write_policies'::text as kind,
           count(*)::text as payload, '1a'::text as sort_key
      from pg_policies where schemaname='public' and cmd in ('INSERT','UPDATE','DELETE','ALL')
        and (coalesce(qual,'')||coalesce(with_check,'')) ~ '(app_users|user_profiles)'
        and (coalesce(qual,'')||coalesce(with_check,'')) not like '%org_id%'
        and (coalesce(qual,'')||coalesce(with_check,'')) not like '%has_org_role%'
    union all select 'e1_defect','any_app_users_or_user_profiles_policy_left', count(*)::text,'1b'
      from pg_policies where schemaname='public'
        and (coalesce(qual,'')||coalesce(with_check,'')) ~ 'from\s+(public\.)?(app_users|user_profiles)'
    union all select 'e1_defect','self_comparison_tautologies', count(*)::text,'1c'
      from pg_policies where schemaname='public'
        and (qual ~ '\(([a-z_]+)\.([a-z_]+) = \1\.\2\)' or with_check ~ '\(([a-z_]+)\.([a-z_]+) = \1\.\2\)')

    -- e2: THE INVARIANT THIS SLICE IS DEFINED BY. Business authority must not have moved into RLS.
    union all select 'e2_invariant','policies_naming_a_capability', count(*)::text,'2a'
      from pg_policies where schemaname='public'
        and (coalesce(qual,'')||coalesce(with_check,'')) ~ '(fin|work|tours|crm|reports|business_process|ai|forms|processing|communications|layouts|fields|scheduling)\.[a-z_]+'

    -- e3: containment — nothing may have been left open by REMOVING policies.
    union all select 'e3_containment','rls_disabled_tables_total', count(*)::text,'3a'
      from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
      where c.relkind='r' and not c.relrowsecurity
    union all select 'e3_containment','rls_disabled_WITH_authenticated_writes', count(*)::text,'3b'
      from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
      where c.relkind='r' and not c.relrowsecurity
        and exists (select 1 from information_schema.role_table_grants g
                     where g.table_name=c.relname and g.grantee='authenticated'
                       and g.privilege_type in ('INSERT','UPDATE','DELETE'))
    union all select 'e3_containment','tables_with_zero_policies_but_RLS_ON', count(*)::text,'3c'
      from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
      where c.relkind='r' and c.relrowsecurity
        and not exists (select 1 from pg_policies p where p.tablename=c.relname and p.schemaname='public')

    -- e4: the org-scoped policies that had to SURVIVE beside the dropped ones.
    union all select 'e4_survivors','has_org_role_policy_tables', count(distinct tablename)::text,'4a'
      from pg_policies where schemaname='public' and (coalesce(qual,'')||coalesce(with_check,'')) like '%has_org_role%'
    union all select 'e4_survivors','payments_policies', count(*)::text,'4b'
      from pg_policies where schemaname='public' and tablename='payments'
    union all select 'e4_survivors','work_units_policies', count(*)::text,'4c'
      from pg_policies where schemaname='public' and tablename='work_units'
    union all select 'e4_survivors','app_users_read_self_present', count(*)::text,'4d'
      from pg_policies where schemaname='public' and tablename='app_users' and policyname='app_users_read_self'

    -- e5: ledger identity and health, re-measured rather than carried.
    union all select 'e5_ledger','identity_20260916040000', count(*)::text,'5a'
      from supabase_migrations.schema_migrations where version='20260916040000'
    union all select 'e5_ledger','duplicate_versions', count(*)::text,'5b'
      from (select version from supabase_migrations.schema_migrations group by version having count(*)>1) d
    union all select 'e5_ledger','head', max(version)::text,'5c' from supabase_migrations.schema_migrations
    union all select 'e5_ledger','total', count(*)::text,'5d' from supabase_migrations.schema_migrations

    -- e6: the predicate tables are still empty, so nothing was quietly seeded.
    union all select 'e6_identity','app_users_rows', count(*)::text,'6a' from public.app_users
    union all select 'e6_identity','user_profiles_rows', count(*)::text,'6b' from public.user_profiles
    union all select 'e6_identity','user_roles_rows', count(*)::text,'6c' from public.user_roles
    union all select 'e6_identity','total_public_policies', count(*)::text,'6d' from pg_policies where schemaname='public'
) rows order by sort_key;
