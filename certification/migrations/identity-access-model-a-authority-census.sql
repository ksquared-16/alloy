-- Read-only, CATALOG-ONLY census: the current Identity/Access authority surface
-- of the deployed primary, measured for RLS Model A convergence.
--
-- WHY THIS EXISTS. `docs/platform/governance/rls-authority-model-director-gate.md`
-- recorded a measurement on 2026-09-16 and the Director ratified Model A on
-- 2026-09-30. The convergence packet may not be built on those numbers: other
-- lanes have landed migrations since, and a revoke proposed against a stale
-- grant population is a revoke proposed against a database that no longer
-- exists. Every count below is re-derived here so the drift map is current.
--
-- WHAT IT MUST NOT BE. A query that touches application data. Every FROM below
-- is a system catalog (pg_class, pg_policy, pg_proc, information_schema
-- privilege views). No tenant row is read, so this census carries no PII and
-- cannot be invalidated by application state.
--
-- READING THE OUTPUT. `payload` is `subject ~ dimension ~ value`, so a reader
-- can split on ' ~ ' without re-parsing SQL. Counts are emitted as their own
-- rows so a later run can be diffed against this one numerically.
select question_id, kind, payload
from (
    -- ══ A. TABLE / RLS POPULATION ════════════════════════════════════════
    select 'a_rls'::text as question_id, 'count'::text as kind,
           ('public_base_tables ~ total ~ '
            || (select count(*) from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r'))::text as payload,
           'a01'::text as sort_key
    union all
    select 'a_rls', 'count',
           'public_base_tables ~ rls_enabled ~ '
           || (select count(*) from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
           'a02'
    union all
    -- Every table with RLS OFF, named. This is the exposure list, not a count.
    select 'a_rls', 'rls_disabled_table',
           'rls_disabled ~ table ~ ' || c.relname::text,
           'a03_' || c.relname::text
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    union all

    -- ══ B. AUTHENTICATED WRITE GRANTS ════════════════════════════════════
    -- The population Model A calls drift. Counted, then enumerated.
    select 'b_grants', 'count',
           'authenticated_write_grant ~ distinct_tables ~ '
           || (select count(distinct g.table_name)
                 from information_schema.role_table_grants g
                where g.grantee = 'authenticated' and g.table_schema = 'public'
                  and g.privilege_type in ('INSERT','UPDATE','DELETE')),
           'b01'
    union all
    select 'b_grants', 'count',
           'authenticated_write_grant ~ ' || lower(x.privilege_type) || '_tables ~ '
           || x.n, 'b02_' || lower(x.privilege_type)
      from (select g.privilege_type, count(distinct g.table_name) as n
              from information_schema.role_table_grants g
             where g.grantee = 'authenticated' and g.table_schema = 'public'
               and g.privilege_type in ('INSERT','UPDATE','DELETE')
             group by g.privilege_type) x
    union all
    select 'b_grants', 'count',
           'authenticated_select_grant ~ distinct_tables ~ '
           || (select count(distinct g.table_name)
                 from information_schema.role_table_grants g
                where g.grantee = 'authenticated' and g.table_schema = 'public'
                  and g.privilege_type = 'SELECT'),
           'b03'
    union all
    -- Per-table write privilege set, so the migration packet can name tables.
    select 'b_grants', 'write_table',
           'authenticated_write ~ ' || g.table_name::text || ' ~ '
           || string_agg(distinct lower(g.privilege_type), ',' order by lower(g.privilege_type)),
           'b04_' || g.table_name::text
      from information_schema.role_table_grants g
     where g.grantee = 'authenticated' and g.table_schema = 'public'
       and g.privilege_type in ('INSERT','UPDATE','DELETE')
     group by g.table_name
    union all

    -- ══ C. POLICY SHAPES ═════════════════════════════════════════════════
    select 'c_policy', 'count',
           'policies ~ total_public ~ '
           || (select count(*) from pg_policy p
               join pg_class c on c.oid = p.polrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'),
           'c01'
    union all
    -- polcmd: 'r' select, 'a' insert, 'w' update, 'd' delete, '*' all
    select 'c_policy', 'count',
           'policies ~ write_capable_tables ~ '
           || (select count(distinct c.relname) from pg_policy p
               join pg_class c on c.oid = p.polrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and p.polcmd in ('a','w','d','*')),
           'c02'
    union all
    -- The four shapes named in the ratified gate document, re-counted against
    -- WRITE policies only. A shape count that includes SELECT policies would
    -- overstate the write surface.
    select 'c_policy', 'count',
           'write_policy_shape ~ ' || s.shape || ' ~ ' || s.n, 'c03_' || s.shape
      from (
        select case
                 when pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) like '%has_org_role%'
                   then 'has_org_role'
                 when pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) like '%service_role%'
                   then 'service_role_only'
                 when pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) like '%app_users%'
                   then 'app_users_global_role'
                 when pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) like '%user_roles%'
                   then 'user_roles_handrolled'
                 when pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) like '%current_org_id%'
                   then 'current_org_id'
                 else 'other' end as shape,
               count(*) as n
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and p.polcmd in ('a','w','d','*')
         group by 1) s
    union all
    -- THE TENANCY CLASS. app_users-shaped WRITE policies that never mention
    -- org_id: Phase 2 of the staged plan. Named, because the repair is per-policy.
    select 'c_policy', 'app_users_no_org_write_policy',
           'untenanted_write_policy ~ ' || c.relname || ' ~ ' || p.polname,
           'c04_' || c.relname || '_' || p.polname
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and p.polcmd in ('a','w','d','*')
       and pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) like '%app_users%'
       and pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) not like '%org_id%'
    union all
    select 'c_policy', 'count',
           'untenanted_app_users_write_policy ~ total ~ '
           || (select count(*) from pg_policy p
               join pg_class c on c.oid = p.polrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and p.polcmd in ('a','w','d','*')
                and pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) like '%app_users%'
                and pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) not like '%org_id%'),
           'c05'
    union all
    -- Tables holding an authenticated write grant AND NO write policy at all.
    -- With RLS on, these deny; the grant is pure excess.
    select 'c_policy', 'count',
           'authenticated_write_grant_no_write_policy ~ tables ~ '
           || (select count(*) from (
                 select distinct g.table_name
                   from information_schema.role_table_grants g
                  where g.grantee = 'authenticated' and g.table_schema = 'public'
                    and g.privilege_type in ('INSERT','UPDATE','DELETE')
                    and not exists (
                       select 1 from pg_policy p
                       join pg_class c2 on c2.oid = p.polrelid
                       join pg_namespace n2 on n2.oid = c2.relnamespace
                      where n2.nspname = 'public' and c2.relname = g.table_name
                        and p.polcmd in ('a','w','d','*'))) z),
           'c06'
    union all

    -- ══ D. WORK_UNITS SELF-COMPARISON TAUTOLOGY ══════════════════════════
    -- The gate document found exactly two. Re-derived generically: any write
    -- policy whose expression contains an X.org_id = X.org_id self-comparison.
    select 'd_taut', 'tautology_policy',
           'self_comparison_write_policy ~ ' || c.relname || ' ~ ' || p.polname,
           'd01_' || c.relname || '_' || p.polname
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and p.polcmd in ('a','w','d','*')
       and pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid)
           ~ '([a-z_]+)\.org_id = \1\.org_id'
    union all

    -- ══ E. current_org_id() — INERT IN MULTI-ORG ══════════════════════════
    select 'e_org', 'check',
           'current_org_id ~ exists ~ '
           || coalesce((select 'true' from pg_proc p
                        join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = 'current_org_id' limit 1), 'false'),
           'e01'
    union all
    select 'e_org', 'count',
           'current_org_id ~ write_policies_depending_on_it ~ '
           || (select count(*) from pg_policy p
               join pg_class c on c.oid = p.polrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and p.polcmd in ('a','w','d','*')
                and pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) like '%current_org_id%'),
           'e02'
    union all
    -- Org count decides whether the predicate denies or becomes permissive.
    -- pg_class reltuples is an ESTIMATE and catalog-only; exact count would
    -- require reading the orgs table, which this census deliberately does not.
    select 'e_org', 'value',
           'orgs ~ reltuples_estimate ~ '
           || coalesce((select c.reltuples::bigint::text from pg_class c
                        join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relname = 'orgs'), 'absent'),
           'e03'
    union all

    -- ══ F. PAYMENT_PROVIDER_DISPUTES ═════════════════════════════════════
    select 'f_ppd', 'check',
           'payment_provider_disputes ~ rls_enabled ~ '
           || coalesce((select c.relrowsecurity::text from pg_class c
                        join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relname = 'payment_provider_disputes'),
                       'table_absent'),
           'f01'
    union all
    select 'f_ppd', 'count',
           'payment_provider_disputes ~ policies ~ '
           || coalesce((select count(*)::text from pg_policy p
                        join pg_class c on c.oid = p.polrelid
                        join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relname = 'payment_provider_disputes'),
                       '0'),
           'f02'
    union all
    select 'f_ppd', 'grant',
           'payment_provider_disputes ~ ' || g.grantee::text || ' ~ '
           || string_agg(distinct lower(g.privilege_type), ',' order by lower(g.privilege_type)),
           'f03_' || g.grantee::text
      from information_schema.role_table_grants g
     where g.table_schema = 'public' and g.table_name = 'payment_provider_disputes'
     group by g.grantee
    union all
    select 'f_ppd', 'check',
           'payment_provider_disputes ~ has_org_id_column ~ '
           || coalesce((select 'true' from information_schema.columns
                        where table_schema = 'public'
                          and table_name = 'payment_provider_disputes'
                          and column_name = 'org_id' limit 1), 'false'),
           'f04'
    union all
    -- The sibling shape the repair should match, so the packet copies rather
    -- than invents a policy.
    select 'f_ppd', 'sibling_policy',
           'payment_sibling ~ ' || c.relname || ' ~ ' || p.polname || ' :: '
           || coalesce(pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid), 'null'),
           'f05_' || c.relname || '_' || p.polname
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname like 'payment_%'
       and c.relname <> 'payment_provider_disputes'
    union all

    -- ══ G. APP_USERS ═════════════════════════════════════════════════════
    select 'g_appusers', 'column',
           'app_users ~ column ~ ' || column_name::text || ' :: ' || data_type::text
           || ' :: nullable=' || is_nullable::text,
           'g01_' || column_name::text
      from information_schema.columns
     where table_schema = 'public' and table_name = 'app_users'
    union all
    select 'g_appusers', 'policy',
           'app_users ~ ' || p.polname || ' ~ cmd=' || p.polcmd::text
           || ' :: permissive=' || p.polpermissive::text
           || ' :: qual=' || coalesce(pg_get_expr(p.polqual, p.polrelid), 'null')
           || ' :: check=' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'null'),
           'g02_' || p.polname
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'app_users'
    union all
    select 'g_appusers', 'grant',
           'app_users ~ ' || g.grantee::text || ' ~ '
           || string_agg(distinct lower(g.privilege_type), ',' order by lower(g.privilege_type)),
           'g03_' || g.grantee::text
      from information_schema.role_table_grants g
     where g.table_schema = 'public' and g.table_name = 'app_users'
     group by g.grantee
    union all

    -- ══ H. SECURITY DEFINER + AUTHENTICATED EXECUTE ══════════════════════
    select 'h_func', 'count',
           'functions ~ security_definer_public ~ '
           || (select count(*) from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosecdef),
           'h01'
    union all
    select 'h_func', 'count',
           'functions ~ authenticated_execute_public ~ '
           || (select count(distinct p.oid) from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
           'h02'
    union all
    -- MUTATING RPC CANDIDATES. A function is a mutation candidate when it is
    -- not marked immutable/stable AND its body contains a write verb. provolatile
    -- 'v' alone is too broad (a plain SELECT function defaults to volatile), so
    -- the body test is what carries the classification.
    select 'h_func', 'mutating_authenticated_function',
           'mutating_rpc ~ ' || p.proname::text || ' ~ secdef=' || p.prosecdef::text
           || ' :: volatile=' || p.provolatile::text
           || ' :: args=' || pg_get_function_arguments(p.oid)
           || ' :: mentions_org=' || (pg_get_functiondef(p.oid) like '%org_id%')::text
           || ' :: mentions_auth_uid=' || (pg_get_functiondef(p.oid) like '%auth.uid()%')::text,
           'h03_' || p.proname::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and p.provolatile = 'v'
       and p.prokind = 'f'
       and (pg_get_functiondef(p.oid) ~* '\m(insert into|update |delete from)\M')
    union all
    select 'h_func', 'count',
           'mutating_rpc ~ authenticated_executable_total ~ '
           || (select count(*) from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                and p.provolatile = 'v' and p.prokind = 'f'
                and (pg_get_functiondef(p.oid) ~* '\m(insert into|update |delete from)\M')),
           'h04'
    union all
    -- effective_capability_keys: the only existing capability primitive.
    select 'h_func', 'check',
           'effective_capability_keys ~ exists ~ '
           || coalesce((select 'true' from pg_proc p
                        join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public'
                         and p.proname = 'effective_capability_keys' limit 1), 'false'),
           'h05'
    union all
    select 'h_func', 'count',
           'policies ~ referencing_effective_capability_keys ~ '
           || (select count(*) from pg_policy p
               join pg_class c on c.oid = p.polrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid)
                    like '%effective_capability_keys%'),
           'h06'
    union all

    -- ══ I. USER_PERSON_LINKS — THE IDENTITY BRIDGE ═══════════════════════
    select 'i_upl', 'check',
           'user_person_links ~ exists ~ '
           || coalesce((select 'true' from pg_class c
                        join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relname = 'user_person_links'
                         and c.relkind = 'r' limit 1), 'false'),
           'i01'
    union all
    select 'i_upl', 'column',
           'user_person_links ~ column ~ ' || column_name::text || ' :: ' || data_type::text,
           'i02_' || column_name::text
      from information_schema.columns
     where table_schema = 'public' and table_name = 'user_person_links'
    union all
    select 'i_upl', 'constraint',
           'user_person_links ~ constraint ~ ' || conname::text || ' :: ' || contype::text
           || ' :: ' || pg_get_constraintdef(oid),
           'i03_' || conname::text
      from pg_constraint
     where conrelid = (select c.oid from pg_class c
                       join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relname = 'user_person_links'
                      limit 1)
    union all

    -- ══ J. MIGRATION LEDGER HEAD (staleness anchor) ══════════════════════
    -- So a later reader can tell whether this census predates another lane's
    -- migrations. supabase_migrations is infrastructure, not application data.
    select 'j_ledger', 'value',
           'schema_migrations ~ max_version ~ '
           || coalesce((select max(version) from supabase_migrations.schema_migrations), 'none'),
           'j01'
    union all
    select 'j_ledger', 'count',
           'schema_migrations ~ applied_total ~ '
           || (select count(*) from supabase_migrations.schema_migrations),
           'j02'
) q
order by sort_key, payload;
