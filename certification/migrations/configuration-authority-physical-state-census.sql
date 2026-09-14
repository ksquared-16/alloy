-- Read-only census: are 20260914183000 and 20260914184000 PHYSICALLY present, and does the ledger
-- still lack their identities?
--
-- The Department slice's merge refuses with `hosted_migration_behind` naming these two, which PR
-- #959 promoted. They are the split state PR #930 designed for: schema applied, ledger identity
-- absent. This census is the evidence the governed ledger repair reads, so it is shaped to that
-- reader rather than to a human:
--
--   * every `m<last six of version>` row must end in ` ~ true`, because the reader counts any row
--     whose final `~`-delimited segment is not `true` as a MISMATCH and downgrades the version to
--     PARTIALLY_PRESENT. A prose payload with no `~` reads as one mismatch, which is how a correct
--     measurement gets reported as an incomplete one.
--   * `ledger_version` rows shaped `<version> ~ registered ~ present|absent ~ <bool>` are what make
--     parity report BEHIND. Without them the repair computes parity `ok` and refuses the very
--     situation it exists for.
--   * `ledger_head` and `ledger_total`, unfiltered, in the SAME census — a repair authorised against
--     a state must execute against that state.
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
    -- m183000 — the three sensitive keys, and the SHAPE of the grants. The ops exclusion is the half
    -- a key count would miss, and it is the half that matters.
    select 'm183000'::text, 'physical'::text,
           ('sensitive keys catalogued ~ expected 3 ~ got '
            || (select count(*) from public.permission_definitions
                 where key in ('option_sets.delete','layouts.lifecycle','fields.delete') and is_active)::text
            || ' ~ ' || ((select count(*) from public.permission_definitions
                 where key in ('option_sets.delete','layouts.lifecycle','fields.delete') and is_active) = 3)::text)::text,
           'a1a'::text
    union all
    select 'm183000'::text, 'physical'::text,
           ('admin roles holding all six ~ expected 0 short ~ got '
            || (select count(*) from public.role_definitions rd
                 where rd.role_key = 'admin' and rd.is_active
                   and (select count(distinct g.permission_key) from public.role_permission_grants g
                         where g.org_id = rd.org_id and g.role_key = 'admin' and g.allowed
                           and g.permission_key in ('option_sets.manage','option_sets.delete',
                                                    'layouts.manage','layouts.lifecycle',
                                                    'fields.manage','fields.delete')) <> 6)::text
            || ' ~ ' || ((select count(*) from public.role_definitions rd
                 where rd.role_key = 'admin' and rd.is_active
                   and (select count(distinct g.permission_key) from public.role_permission_grants g
                         where g.org_id = rd.org_id and g.role_key = 'admin' and g.allowed
                           and g.permission_key in ('option_sets.manage','option_sets.delete',
                                                    'layouts.manage','layouts.lifecycle',
                                                    'fields.manage','fields.delete')) <> 6) = 0)::text)::text,
           'a1b'::text
    union all
    select 'm183000'::text, 'physical'::text,
           ('ops holds none of the sensitive three ~ expected 0 ~ got '
            || (select count(*) from public.role_permission_grants
                 where role_key = 'ops'
                   and permission_key in ('option_sets.delete','layouts.lifecycle','fields.delete'))::text
            || ' ~ ' || ((select count(*) from public.role_permission_grants
                 where role_key = 'ops'
                   and permission_key in ('option_sets.delete','layouts.lifecycle','fields.delete')) = 0)::text)::text,
           'a1c'::text
    union all
    select 'm183000'::text, 'physical'::text,
           ('director roles hold none ~ expected 0 ~ got '
            || (select count(*) from public.role_permission_grants
                 where role_key in ('school_director','regional_lead')
                   and permission_key in ('option_sets.delete','layouts.lifecycle','fields.delete'))::text
            || ' ~ ' || ((select count(*) from public.role_permission_grants
                 where role_key in ('school_director','regional_lead')
                   and permission_key in ('option_sets.delete','layouts.lifecycle','fields.delete')) = 0)::text)::text,
           'a1d'::text

    -- m184000 — the INSTALLED seed's own text, plus the trigger that calls it.
    union all
    select 'm184000'::text, 'physical'::text,
           ('seed_default_rbac installed with both sentinel regions ~ expected true ~ got '
            || (def <> '' and admin_region <> '' and ops_region <> '')::text
            || ' ~ ' || (def <> '' and admin_region <> '' and ops_region <> '')::text)::text, 'a2a'::text
    from regions
    union all
    select 'm184000'::text, 'physical'::text,
           ('admin enumeration carries all three sensitive keys ~ expected true ~ got '
            || ((position('''option_sets.delete''' in admin_region) > 0)
            and (position('''layouts.lifecycle''' in admin_region) > 0)
            and (position('''fields.delete''' in admin_region) > 0))::text
            || ' ~ ' || ((position('''option_sets.delete''' in admin_region) > 0)
            and (position('''layouts.lifecycle''' in admin_region) > 0)
            and (position('''fields.delete''' in admin_region) > 0))::text)::text, 'a2b'::text
    from regions
    union all
    select 'm184000'::text, 'physical'::text,
           ('ops enumeration carries none of them ~ expected true ~ got '
            || (not ((position('''option_sets.delete''' in ops_region) > 0)
                  or (position('''layouts.lifecycle''' in ops_region) > 0)
                  or (position('''fields.delete''' in ops_region) > 0)))::text
            || ' ~ ' || (not ((position('''option_sets.delete''' in ops_region) > 0)
                  or (position('''layouts.lifecycle''' in ops_region) > 0)
                  or (position('''fields.delete''' in ops_region) > 0)))::text)::text, 'a2c'::text
    from regions
    union all
    select 'm184000'::text, 'physical'::text,
           ('ops keeps the three manage keys it already exercised ~ expected true ~ got '
            || ((position('''option_sets.manage''' in ops_region) > 0)
            and (position('''layouts.manage''' in ops_region) > 0)
            and (position('''fields.manage''' in ops_region) > 0))::text
            || ' ~ ' || ((position('''option_sets.manage''' in ops_region) > 0)
            and (position('''layouts.manage''' in ops_region) > 0)
            and (position('''fields.manage''' in ops_region) > 0))::text)::text, 'a2d'::text
    from regions

    -- LEDGER TRUTH. `ledger_version` is what makes parity report BEHIND; the final segment is
    -- whether the ledger ALREADY carries that identity, so `false` is the gap being registered.
    union all
    select 'ledger_version'::text, 'ledger'::text,
           (v || ' ~ registered ~ '
            || case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v)
                    then 'present' else 'absent' end
            || ' ~ ' || exists (select 1 from supabase_migrations.schema_migrations m where m.version = v)::text)::text,
           'y_' || v
    from (values ('20260914183000'),('20260914184000')) as t(v)

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
