-- Read-only, CATALOG-ONLY census #2: the questions the first Model A census
-- raised rather than answered.
--
-- WHY THIS EXISTS. `identity-access-model-a-authority-census.sql` established the
-- populations. Four of its results cannot be acted on as they stand:
--
--   1. It found 18 authenticated-EXECUTABLE mutating functions, several
--      SECURITY DEFINER, and reported `mentions_auth_uid=false` for every one.
--      If that is literally true, the effective authority of those functions is
--      whatever the CALLER passes in `p_org_id` / `p_actor`, and SECURITY DEFINER
--      means RLS never sees the write. That is a privilege-escalation shape and
--      it must be confirmed against the function bodies, not inferred from a
--      substring test.
--   2. It reported ZERO untenanted `app_users`-shaped write policies where the
--      ratified gate document found 51. A zero has two readings — the class was
--      repaired, or the probe missed it — and only the policy text separates them.
--   3. It found the `work_units` self-comparison tautology absent. Same problem:
--      the regex may simply not match the installed text.
--   4. It found a SECOND RLS-disabled table, `commercial_policy_exceptions`,
--      whose grants were never measured.
--
-- Plus: 142 write policies matched none of the four known shapes, and the `orgs`
-- row estimate came back -1 (never analyzed), so whether `current_org_id()` denies
-- or is load-bearing is still unknown.
--
-- SCOPE. System catalogs only, with one exception stated plainly: `count(*)` on
-- `public.orgs`. That is a single integer, carries no PII, and is the only way to
-- answer question 4 — `pg_class.reltuples` already returned -1.
select question_id, kind, payload
from (
    -- ══ K. MUTATING RPC AUTHORITY — THE REAL QUESTION ════════════════════
    -- For each authenticated-executable mutating function: does its body contain
    -- ANY caller-identity or caller-authority check at all? Trigger functions are
    -- excluded here (prorettype = trigger), which the first census wrongly kept.
    select 'k_rpc'::text as question_id, 'rpc_authority'::text as kind,
           ('rpc ~ ' || p.proname::text
            || ' ~ secdef=' || p.prosecdef::text
            || ' :: auth_uid=' || (pg_get_functiondef(p.oid) like '%auth.uid()%')::text
            || ' :: auth_role=' || (pg_get_functiondef(p.oid) like '%auth.role()%')::text
            || ' :: has_org_role=' || (pg_get_functiondef(p.oid) like '%has_org_role%')::text
            || ' :: capability_fn=' || (pg_get_functiondef(p.oid) like '%effective_capability_keys%')::text
            || ' :: user_roles=' || (pg_get_functiondef(p.oid) like '%user_roles%')::text
            || ' :: app_users=' || (pg_get_functiondef(p.oid) like '%app_users%')::text
            || ' :: search_path=' || coalesce(array_to_string(p.proconfig, ','), 'unset'))::text as payload,
           ('k01_' || p.proname::text)::text as sort_key
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and p.provolatile = 'v' and p.prokind = 'f'
       and p.prorettype <> 'trigger'::regtype
       and (pg_get_functiondef(p.oid) ~* '\m(insert into|update |delete from)\M')
    union all
    select 'k_rpc', 'count',
           'mutating_rpc_excluding_triggers ~ authenticated_executable ~ '
           || (select count(*) from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                and p.provolatile = 'v' and p.prokind = 'f'
                and p.prorettype <> 'trigger'::regtype
                and (pg_get_functiondef(p.oid) ~* '\m(insert into|update |delete from)\M')),
           'k02'
    union all
    -- Of those, how many contain NO caller-authority check of any recognised kind.
    -- This is the number that decides whether an EXECUTE revoke is needed.
    select 'k_rpc', 'count',
           'mutating_rpc ~ no_caller_authority_check ~ '
           || (select count(*) from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                and p.provolatile = 'v' and p.prokind = 'f'
                and p.prorettype <> 'trigger'::regtype
                and (pg_get_functiondef(p.oid) ~* '\m(insert into|update |delete from)\M')
                and pg_get_functiondef(p.oid) not like '%auth.uid()%'
                and pg_get_functiondef(p.oid) not like '%auth.role()%'
                and pg_get_functiondef(p.oid) not like '%has_org_role%'
                and pg_get_functiondef(p.oid) not like '%effective_capability_keys%'),
           'k03'
    union all
    -- Whether EXECUTE to authenticated is an explicit grant or PUBLIC default.
    -- A function with no proacl inherits EXECUTE for PUBLIC, which is a different
    -- remediation (REVOKE FROM PUBLIC) than an explicit grant to authenticated.
    select 'k_rpc', 'rpc_acl',
           'rpc_acl ~ ' || p.proname::text || ' ~ '
           || coalesce(array_to_string(p.proacl::text[], ' | '), 'null_acl_public_default'),
           'k04_' || p.proname::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and p.provolatile = 'v' and p.prokind = 'f'
       and p.prorettype <> 'trigger'::regtype
       and (pg_get_functiondef(p.oid) ~* '\m(insert into|update |delete from)\M')
    union all

    -- ══ L. app_users — POLICY REFERENCES, TEXT NOT SHAPE ═════════════════
    -- Every write policy that mentions app_users AT ALL, with its full predicate,
    -- so "0 untenanted" can be confirmed or refuted by reading rather than by a
    -- not-like test. If this returns no rows, the class is genuinely gone.
    select 'l_appusers', 'app_users_write_policy',
           'app_users_referencing_write_policy ~ ' || c.relname::text || ' ~ ' || p.polname::text
           || ' :: cmd=' || p.polcmd::text
           || ' :: qual=' || coalesce(pg_get_expr(p.polqual, p.polrelid), 'null')
           || ' :: check=' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'null'),
           'l01_' || c.relname::text || '_' || p.polname::text
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and p.polcmd in ('a','w','d','*')
       and pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) like '%app_users%'
    union all
    select 'l_appusers', 'count',
           'app_users_referencing_policies ~ all_commands ~ '
           || (select count(*) from pg_policy p
               join pg_class c on c.oid = p.polrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public'
                and pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) like '%app_users%'),
           'l02'
    union all
    -- THE id VS auth_user_id QUESTION. app_users carries BOTH `id` and
    -- `auth_user_id`, and its only policy compares `id = auth.uid()`. If the auth
    -- identity actually lives in auth_user_id, that policy reads the wrong column.
    -- The FK tells us which column references auth.users.
    select 'l_appusers', 'constraint',
           'app_users ~ constraint ~ ' || conname::text || ' :: ' || contype::text
           || ' :: ' || pg_get_constraintdef(oid),
           'l03_' || conname::text
      from pg_constraint
     where conrelid = (select c.oid from pg_class c
                       join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relname = 'app_users' limit 1)
    union all

    -- ══ M. work_units WRITE POLICIES — VERBATIM ══════════════════════════
    -- The tautology question, answered by reading the installed text instead of
    -- pattern-matching it.
    select 'm_workunits', 'work_units_policy',
           'work_units ~ ' || p.polname::text || ' :: cmd=' || p.polcmd::text
           || ' :: qual=' || coalesce(pg_get_expr(p.polqual, p.polrelid), 'null')
           || ' :: check=' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'null'),
           'm01_' || p.polname::text
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'work_units'
    union all

    -- ══ N. commercial_policy_exceptions — THE SECOND RLS-OFF TABLE ═══════
    select 'n_cpe', 'grant',
           'commercial_policy_exceptions ~ ' || g.grantee::text || ' ~ '
           || string_agg(distinct lower(g.privilege_type), ',' order by lower(g.privilege_type)),
           'n01_' || g.grantee::text
      from information_schema.role_table_grants g
     where g.table_schema = 'public' and g.table_name = 'commercial_policy_exceptions'
     group by g.grantee
    union all
    select 'n_cpe', 'check',
           'commercial_policy_exceptions ~ has_org_id_column ~ '
           || coalesce((select 'true' from information_schema.columns
                        where table_schema='public' and table_name='commercial_policy_exceptions'
                          and column_name='org_id' limit 1), 'false'),
           'n02'
    union all
    select 'n_cpe', 'count',
           'commercial_policy_exceptions ~ policies ~ '
           || (select count(*) from pg_policy p
               join pg_class c on c.oid = p.polrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname='public' and c.relname='commercial_policy_exceptions'),
           'n03'
    union all

    -- ══ O. THE 142 UNCLASSIFIED WRITE POLICY SHAPES ══════════════════════
    -- Distinct predicate texts, capped, so the drift map can say what they are
    -- instead of calling 142 policies "other".
    select 'o_other', 'unclassified_write_predicate',
           'unclassified ~ ' || x.relname || ' ~ ' || x.expr,
           'o01_' || x.relname || '_' || x.polname
      from (
        select c.relname::text as relname, p.polname::text as polname,
               left(coalesce(pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid), 'null'), 200) as expr
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and p.polcmd in ('a','w','d','*')
           and coalesce(pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid), '') not like '%has_org_role%'
           and coalesce(pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid), '') not like '%service_role%'
           and coalesce(pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid), '') not like '%app_users%'
           and coalesce(pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid), '') not like '%user_roles%'
           and coalesce(pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid), '') not like '%current_org_id%'
         order by c.relname, p.polname
         limit 150) x
    union all
    -- A write policy with a NULL predicate and NULL check is unconditional: it
    -- permits every authenticated write to that table. Counted separately because
    -- it is the most dangerous member of the "other" bucket.
    select 'o_other', 'count',
           'write_policy ~ unconditional_permissive ~ '
           || (select count(*) from pg_policy p
               join pg_class c on c.oid = p.polrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and p.polcmd in ('a','w','d','*')
                and p.polpermissive
                and p.polqual is null and p.polwithcheck is null),
           'o02'
    union all
    select 'o_other', 'unconditional_policy',
           'unconditional_write_policy ~ ' || c.relname::text || ' ~ ' || p.polname::text
           || ' :: cmd=' || p.polcmd::text || ' :: roles='
           || coalesce(array_to_string(p.polroles::regrole[]::text[], ','), 'null'),
           'o03_' || c.relname::text || '_' || p.polname::text
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and p.polcmd in ('a','w','d','*')
       and p.polpermissive and p.polqual is null and p.polwithcheck is null
    union all

    -- ══ P. ORG COUNT — decides whether current_org_id() denies ════════════
    -- The one non-catalog read in this census: a single integer, no PII.
    select 'p_orgs', 'value',
           'orgs ~ exact_count ~ ' || (select count(*) from public.orgs),
           'p01'
) q
order by sort_key, payload;
