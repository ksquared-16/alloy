-- W-13 DEPLOYED-PRIMARY APPLY CENSUS — READ ONLY.
--
-- WHY THIS EXISTS. `database.apply_promoted_migration` for
-- 20260911140000_w13_portal_access_capability_admission.sql against
-- alloy_deployed_primary failed `execution_failed / migration_outcome_ambiguous`
-- (gar_c1f7e2d9a8e7df). The executor reached the real apply runner, and the
-- failure code it classified on was never persisted, so the host cannot say
-- whether the migration applied, partly applied, or never ran. The classifier
-- itself names the remedy: "governed census to establish actual hosted state
-- before any further action".
--
-- This answers exactly two questions and nothing else:
--   1. is 20260911140000 in the deployed migration ledger?
--   2. do the migration's postconditions exist on the deployed primary?
--
-- OUTPUT CONTRACT, learned the hard way by hosted-ledger-census-v2.sql: the
-- reader takes column 1 as question_id, DISCARDS column 2 unless it is literally
-- 'row_count', and treats column 3+ as payload. An earlier artifact put real
-- values in column 2 and they were silently swallowed. So column 2 is a fixed
-- literal here and every fact travels inside JSON.
--
-- EVERY NEGATIVE HAS A POSITIVE CONTROL. A census that can only say "absent" is
-- indistinguishable from a probe that cannot say anything. Each absence question
-- is paired with a control that must come back present.
--
-- Read-only: one statement, no DDL, no writes, no row-level tenant data. Grant
-- findings are COUNTS, never org_id lists.
select
    question_id,
    'data' as row_kind,
    payload
from (
    -- ── 1. THE LEDGER QUESTION ───────────────────────────────────────────────
    select
        'ledger_w13'::text as question_id,
        json_build_object(
            'version', '20260911140000',
            'present', exists (
                select 1 from supabase_migrations.schema_migrations m
                 where m.version = '20260911140000'
            )
        )::text as payload

    union all

    -- Control: a migration W-13's own preflight requires. If this reads false
    -- too, the ledger probe is broken and no absence above can be believed.
    select
        'ledger_control_20260910183000'::text,
        json_build_object(
            'version', '20260910183000',
            'present', exists (
                select 1 from supabase_migrations.schema_migrations m
                 where m.version = '20260910183000'
            )
        )::text

    union all

    select
        'ledger_ceiling'::text,
        json_build_object('max_version', (select max(m.version) from supabase_migrations.schema_migrations m))::text

    union all

    -- Neighbours, so a renumber or a partial batch is visible rather than inferred.
    select
        'ledger_window'::text,
        json_build_object('versions', coalesce(json_agg(m.version order by m.version), '[]'::json))::text
    from supabase_migrations.schema_migrations m
    where m.version >= '20260910000000'

    union all

    -- ── 2. PREFLIGHT OBJECTS the migration itself refuses without ────────────
    select
        'preflight_objects'::text,
        json_build_object(
            'permission_definitions', to_regclass('public.permission_definitions') is not null,
            'role_permission_grants', to_regclass('public.role_permission_grants') is not null,
            'role_definitions',       to_regclass('public.role_definitions') is not null,
            'seed_default_rbac',      to_regprocedure('public.seed_default_rbac(uuid)') is not null
        )::text

    union all

    -- ── 3. POSTCONDITION A — the catalog row (§1 of the migration) ───────────
    select
        'postcondition_catalog_portal_access'::text,
        json_build_object(
            'key', 'portal.access',
            'present', count(*) > 0,
            'group_key', min(pd.group_key),
            'is_active', bool_and(pd.is_active)
        )::text
    from public.permission_definitions pd
    where pd.key = 'portal.access'

    union all

    -- Control: a key that predates W-13 and must be present.
    select
        'postcondition_catalog_control'::text,
        json_build_object(
            'key', 'settings.users_roles',
            'present', exists (
                select 1 from public.permission_definitions pd where pd.key = 'settings.users_roles'
            )
        )::text

    union all

    -- ── 4. POSTCONDITION B — the preservation grants (§2) ────────────────────
    -- Counts only. Which tenants hold a grant is not this question.
    select
        'postcondition_grants_portal_access'::text,
        json_build_object(
            'permission_key', 'portal.access',
            'rows', count(*),
            'allowed_true', count(*) filter (where g.allowed),
            'roles', coalesce(json_agg(distinct g.role_key), '[]'::json)
        )::text
    from public.role_permission_grants g
    where g.permission_key = 'portal.access'

    union all

    -- What §2 WOULD grant, so "some rows" can be told from "all rows".
    select
        'expected_grant_pairs'::text,
        json_build_object(
            'admin_ops_role_definitions', count(*),
            'roles', coalesce(json_agg(distinct rd.role_key), '[]'::json)
        )::text
    from public.role_definitions rd
    where rd.role_key in ('admin', 'ops')

    union all

    -- Control: the same shape for a pre-existing key, proving the grants probe
    -- can return non-zero at all.
    select
        'postcondition_grants_control'::text,
        json_build_object(
            'permission_key', 'settings.users_roles',
            'rows', count(*)
        )::text
    from public.role_permission_grants g
    where g.permission_key = 'settings.users_roles'

    union all

    -- ── 5. POSTCONDITION C — the re-seeded function (§3) ─────────────────────
    -- W-13 CREATE OR REPLACEs seed_default_rbac with portal.access in both grant
    -- enumerations. If §1/§2 applied but this did not, that is a partial apply.
    select
        'postcondition_seed_fn_portal_access'::text,
        json_build_object(
            'function_present', to_regprocedure('public.seed_default_rbac(uuid)') is not null,
            'mentions_portal_access', coalesce(
                (select position('portal.access' in pg_get_functiondef(p.oid)) > 0
                   from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'seed_default_rbac'
                  limit 1),
                false
            )
        )::text
) as census
order by question_id;
