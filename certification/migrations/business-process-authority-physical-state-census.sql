-- Read-only census: are 20260915090000 and 20260915091000 PHYSICALLY present, and does the ledger
-- still lack their identities?
--
-- The promoted apply reported `migration_applied_ledger_incomplete` — the split state PR #930
-- designed for. This census is the evidence the governed ledger repair reads, so it is shaped to
-- that reader:
--
--   * every `m<last six of version>` row ends in ` ~ true`. The reader counts any row whose final
--     `~`-delimited segment is not `true` as a MISMATCH and downgrades the version to
--     PARTIALLY_PRESENT, so a prose payload with no `~` reads as a failed check.
--   * `ledger_version` rows shaped `<version> ~ registered ~ present|absent ~ <bool>` are what make
--     parity report BEHIND. Without them the repair computes parity `ok` and refuses the exact
--     situation it exists for.
--   * `ledger_head` and `ledger_total`, unfiltered, in the SAME census.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
with src as (
    select case
             when exists (
               select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'seed_default_rbac'
             )
             then pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure)
             else ''
           end as def
),
regions as (
    select def,
           case when position('W12:ADMIN-GRANTS:BEGIN' in def) > 0 and position('W12:ADMIN-GRANTS:END' in def) > 0
                then substr(def, position('W12:ADMIN-GRANTS:BEGIN' in def),
                            position('W12:ADMIN-GRANTS:END' in def) - position('W12:ADMIN-GRANTS:BEGIN' in def))
                else '' end as admin_region,
           case when position('W12:OPS-GRANTS:BEGIN' in def) > 0 and position('W12:OPS-GRANTS:END' in def) > 0
                then substr(def, position('W12:OPS-GRANTS:BEGIN' in def),
                            position('W12:OPS-GRANTS:END' in def) - position('W12:OPS-GRANTS:BEGIN' in def))
                else '' end as ops_region
    from src
)
select question_id, kind, payload
from (
    -- m090000 — the two capabilities, and the grant SHAPE the migration promised. The ops and
    -- director exclusions are the half a key count would miss; all eight converged routes answered
    -- them 403 before this slice, and a migration that widened them would be invisible to a count.
    select 'm090000'::text, 'physical'::text,
           ('business process keys catalogued ~ expected 2 ~ got '
            || (select count(*) from public.permission_definitions
                 where key in ('business_process.configure','business_process.activate') and is_active)::text
            || ' ~ ' || ((select count(*) from public.permission_definitions
                 where key in ('business_process.configure','business_process.activate') and is_active) = 2)::text)::text,
           'a1a'::text
    union all
    select 'm090000'::text, 'physical'::text,
           ('admin roles holding both ~ expected 0 short ~ got '
            || (select count(*) from public.role_definitions rd
                 where rd.role_key = 'admin' and rd.is_active
                   and (select count(distinct g.permission_key) from public.role_permission_grants g
                         where g.org_id = rd.org_id and g.role_key = 'admin' and g.allowed
                           and g.permission_key in ('business_process.configure','business_process.activate')) <> 2)::text
            || ' ~ ' || ((select count(*) from public.role_definitions rd
                 where rd.role_key = 'admin' and rd.is_active
                   and (select count(distinct g.permission_key) from public.role_permission_grants g
                         where g.org_id = rd.org_id and g.role_key = 'admin' and g.allowed
                           and g.permission_key in ('business_process.configure','business_process.activate')) <> 2) = 0)::text)::text,
           'a1b'::text
    union all
    select 'm090000'::text, 'physical'::text,
           ('ops holds neither ~ expected 0 ~ got '
            || (select count(*) from public.role_permission_grants
                 where role_key = 'ops'
                   and permission_key in ('business_process.configure','business_process.activate'))::text
            || ' ~ ' || ((select count(*) from public.role_permission_grants
                 where role_key = 'ops'
                   and permission_key in ('business_process.configure','business_process.activate')) = 0)::text)::text,
           'a1c'::text
    union all
    select 'm090000'::text, 'physical'::text,
           ('director roles hold neither ~ expected 0 ~ got '
            || (select count(*) from public.role_permission_grants
                 where role_key in ('school_director','regional_lead')
                   and permission_key in ('business_process.configure','business_process.activate'))::text
            || ' ~ ' || ((select count(*) from public.role_permission_grants
                 where role_key in ('school_director','regional_lead')
                   and permission_key in ('business_process.configure','business_process.activate')) = 0)::text)::text,
           'a1d'::text
    union all
    -- The retired product must not have gained capability vocabulary.
    select 'm090000'::text, 'physical'::text,
           ('no departments.* capability exists ~ expected 0 ~ got '
            || (select count(*) from public.permission_definitions where key like 'departments.%')::text
            || ' ~ ' || ((select count(*) from public.permission_definitions where key like 'departments.%') = 0)::text)::text,
           'a1e'::text

    -- m091000 — the INSTALLED seed's own text, plus the trigger that calls it. A redefinition
    -- nobody calls changes nothing for a new tenant.
    union all
    select 'm091000'::text, 'physical'::text,
           ('seed_default_rbac installed with both sentinel regions ~ expected true ~ got '
            || (def <> '' and admin_region <> '' and ops_region <> '')::text
            || ' ~ ' || (def <> '' and admin_region <> '' and ops_region <> '')::text)::text, 'a2a'::text
    from regions
    union all
    select 'm091000'::text, 'physical'::text,
           ('admin enumeration carries both keys ~ expected true ~ got '
            || ((position('''business_process.configure''' in admin_region) > 0)
            and (position('''business_process.activate''' in admin_region) > 0))::text
            || ' ~ ' || ((position('''business_process.configure''' in admin_region) > 0)
            and (position('''business_process.activate''' in admin_region) > 0))::text)::text, 'a2b'::text
    from regions
    union all
    select 'm091000'::text, 'physical'::text,
           ('ops enumeration carries neither ~ expected true ~ got '
            || (not ((position('''business_process.configure''' in ops_region) > 0)
                  or (position('''business_process.activate''' in ops_region) > 0)))::text
            || ' ~ ' || (not ((position('''business_process.configure''' in ops_region) > 0)
                  or (position('''business_process.activate''' in ops_region) > 0)))::text)::text, 'a2c'::text
    from regions
    union all
    select 'm091000'::text, 'physical'::text,
           ('seed names no departments.* key ~ expected true ~ got '
            || (position('''departments.' in def) = 0)::text
            || ' ~ ' || (position('''departments.' in def) = 0)::text)::text, 'a2d'::text
    from regions
    union all
    select 'm091000'::text, 'physical'::text,
           ('orgs trigger still calls seed_default_rbac ~ expected 1 ~ got '
            || (select count(*) from pg_trigger t
                 join pg_class c on c.oid = t.tgrelid
                 join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname = 'orgs'
                  and not t.tgisinternal
                  and pg_get_triggerdef(t.oid) like '%seed_default_rbac%')::text
            || ' ~ ' || ((select count(*) from pg_trigger t
                 join pg_class c on c.oid = t.tgrelid
                 join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname = 'orgs'
                  and not t.tgisinternal
                  and pg_get_triggerdef(t.oid) like '%seed_default_rbac%') >= 1)::text)::text, 'a2e'::text

    -- LEDGER TRUTH. The final segment is whether the ledger ALREADY carries that identity, so
    -- `false` is the gap this repair registers.
    union all
    select 'ledger_version'::text, 'ledger'::text,
           (v || ' ~ registered ~ '
            || case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v)
                    then 'present' else 'absent' end
            || ' ~ ' || exists (select 1 from supabase_migrations.schema_migrations m where m.version = v)::text)::text,
           'y_' || v
    from (values ('20260915090000'),('20260915091000')) as t(v)

    union all
    select 'ledger_head'::text, 'max'::text,
           coalesce(max(m.version)::text, 'none'), 'zzzz1'::text
    from supabase_migrations.schema_migrations m
    union all
    select 'ledger_total'::text, 'count'::text,
           count(*)::text, 'zzzz2'::text
    from supabase_migrations.schema_migrations m

    union all
    select 'nonvacuity'::text, 'guard'::text,
           ('catalog_total=' || (select count(*) from public.permission_definitions)::text
            || ' admin_roles=' || (select count(*) from public.role_definitions where role_key='admin' and is_active)::text
            || ' grants_total=' || (select count(*) from public.role_permission_grants)::text)::text,
           'zz0'::text
) q(question_id, kind, payload, sort_key)
order by sort_key;
