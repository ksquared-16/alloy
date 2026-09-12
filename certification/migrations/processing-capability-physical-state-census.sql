-- Read-only census: PHYSICAL state and LEDGER identity of the two Processing capability migrations
-- (20260912040000, 20260912050000) on the deployed primary, in ONE reading.
--
-- WHY THIS EXISTS. `post_apply_verification_failed` is only reachable AFTER the migration runner
-- reports success, so it never means "nothing happened" — it means the schema may be there while
-- the ledger row is not. This lane has seen that three times (D2, W-17, Forms). Diagnosing it
-- requires physical and ledger state read at the SAME moment, in the shape
-- `trusted-host-ledger-repair.mjs` consumes:
--
--     object ~ expected ~ observed ~ match
--
-- under question ids `m<last six of version>`, with the ledger head and total in the same result.
-- A version counts as present only when every one of its rows matched.
--
-- WHAT EACH VERSION IS ASKED FOR. 20260912040000 defines the four capabilities and the
-- compatibility grants, so its evidence is the catalog rows AND the SHAPE of those grants — admin
-- holding all four, ops holding `processing.operate` and none of the other three. A census that
-- only counted catalog rows would call a half-applied migration applied, and the half that matters
-- most here is the ops exclusion: `documents.write` was deliberately NOT reused because ops holds
-- it everywhere, and a migration that widened ops after all would be invisible to a key count.
--
-- 20260912050000 rewrites `seed_default_rbac` so a NEW organization is born with the same grants,
-- so its evidence is the installed function's own text and the trigger that calls it. Reading
-- `pg_get_functiondef` is what makes this a statement about the database rather than the repository.
--
-- Output contract: question_id | kind | payload. The parser takes the first two columns as identity,
-- so the answer must be third. One statement, no DDL, no writes.
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
    select
        def,
        case when strpos(def, 'W12:ADMIN-GRANTS:BEGIN') > 0
             then substr(def, strpos(def, 'W12:ADMIN-GRANTS:BEGIN'),
                         strpos(def, 'W12:ADMIN-GRANTS:END') - strpos(def, 'W12:ADMIN-GRANTS:BEGIN'))
             else '' end as admin_region,
        case when strpos(def, 'W12:OPS-GRANTS:BEGIN') > 0
             then substr(def, strpos(def, 'W12:OPS-GRANTS:BEGIN'),
                         strpos(def, 'W12:OPS-GRANTS:END') - strpos(def, 'W12:OPS-GRANTS:BEGIN'))
             else '' end as ops_region
    from src
),
admin_roles as (
    select count(*)::bigint as n from public.role_definitions rd
    where rd.role_key = 'admin' and rd.is_active
),
admin_full as (
    select count(*)::bigint as n from (
        select g.org_id from public.role_permission_grants g
        where g.role_key = 'admin'
          and g.permission_key in ('processing.operate', 'processing.archive',
                                   'processing.documents.manage', 'processing.dev_cleanup')
        group by g.org_id having count(distinct g.permission_key) = 4
    ) t
),
ops_roles as (
    select count(*)::bigint as n from public.role_definitions rd
    where rd.role_key = 'ops' and rd.is_active
),
ops_operate as (
    select count(distinct g.org_id)::bigint as n from public.role_permission_grants g
    where g.role_key = 'ops' and g.permission_key = 'processing.operate'
),
ops_widened as (
    select count(*)::bigint as n from public.role_permission_grants g
    where g.role_key = 'ops'
      and g.permission_key in ('processing.archive', 'processing.documents.manage', 'processing.dev_cleanup')
),
director_any as (
    select count(*)::bigint as n from public.role_permission_grants g
    where g.role_key in ('school_director', 'regional_lead')
      and g.permission_key like 'processing.%'
),
check_rows as (
    -- 20260912040000 — the capability model itself.
    select 'm040000'::text as qid, 'four processing keys in catalog'::text as obj, '4'::text as expected,
           (select count(*)::text from public.permission_definitions d
             where d.key in ('processing.operate', 'processing.archive',
                             'processing.documents.manage', 'processing.dev_cleanup')
               and d.group_key = 'processing' and d.is_active) as observed,
           'a1'::text as sort_key
    union all
    select 'm040000', 'every admin role holds all four', 'yes',
           case when (select n from admin_full) >= (select n from admin_roles) then 'yes' else 'no' end, 'a2'
    union all
    select 'm040000', 'every ops role holds processing.operate', 'yes',
           case when (select n from ops_operate) >= (select n from ops_roles) then 'yes' else 'no' end, 'a3'
    union all
    -- The exclusion that documents.write was refused to protect. An absence, so it is asserted.
    select 'm040000', 'ops holds none of archive, documents.manage, dev_cleanup', 'yes',
           case when (select n from ops_widened) = 0 then 'yes' else 'no' end, 'a4'
    union all
    select 'm040000', 'director roles hold no processing key', 'yes',
           case when (select n from director_any) = 0 then 'yes' else 'no' end, 'a5'

    -- 20260912050000 — a NEW organization is born with the same grants.
    union all
    select 'm050000', 'seed_default_rbac exists', 'present',
           case when (select length(def) from src) > 0 then 'present' else 'absent' end, 'b1'
    union all
    select 'm050000', 'admin enumeration carries processing.operate', 'yes',
           case when (select strpos(admin_region, '''processing.operate''') from regions) > 0 then 'yes' else 'no' end, 'b2'
    union all
    select 'm050000', 'admin enumeration carries processing.archive', 'yes',
           case when (select strpos(admin_region, '''processing.archive''') from regions) > 0 then 'yes' else 'no' end, 'b3'
    union all
    select 'm050000', 'admin enumeration carries processing.documents.manage', 'yes',
           case when (select strpos(admin_region, '''processing.documents.manage''') from regions) > 0 then 'yes' else 'no' end, 'b4'
    union all
    select 'm050000', 'admin enumeration carries processing.dev_cleanup', 'yes',
           case when (select strpos(admin_region, '''processing.dev_cleanup''') from regions) > 0 then 'yes' else 'no' end, 'b5'
    union all
    select 'm050000', 'ops enumeration carries processing.operate', 'yes',
           case when (select strpos(ops_region, '''processing.operate''') from regions) > 0 then 'yes' else 'no' end, 'b6'
    union all
    -- Three absences, each asserted separately: an exclusion is exactly what an editor restores by
    -- accident when reproducing a sixty-key enumeration to add one line to it.
    select 'm050000', 'ops enumeration withholds processing.archive', 'yes',
           case when (select strpos(ops_region, '''processing.archive''') from regions) = 0 then 'yes' else 'no' end, 'b7'
    union all
    select 'm050000', 'ops enumeration withholds processing.documents.manage', 'yes',
           case when (select strpos(ops_region, '''processing.documents.manage''') from regions) = 0 then 'yes' else 'no' end, 'b8'
    union all
    select 'm050000', 'ops enumeration withholds processing.dev_cleanup', 'yes',
           case when (select strpos(ops_region, '''processing.dev_cleanup''') from regions) = 0 then 'yes' else 'no' end, 'b9'
    union all
    select 'm050000', 'orgs_seed_default_rbac trigger present', 'present',
           case when exists (select 1 from pg_trigger t where t.tgname = 'orgs_seed_default_rbac' and not t.tgisinternal)
                then 'present' else 'absent' end, 'c1'
)
select question_id, kind, payload
from (
    select qid as question_id, 'physical'::text as kind,
           (obj || ' ~ ' || expected || ' ~ ' || observed || ' ~ ' ||
            (case when observed = expected then 'true' else 'false' end))::text as payload,
           sort_key
    from check_rows

    union all
    select 'ledger_version'::text, 'identity'::text,
           (v.version || ' ~ ledgered ~ ' ||
            (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                  then 'present' else 'absent' end) || ' ~ ' ||
            (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                  then 'true' else 'false' end))::text,
           'y' || v.version
    from (values ('20260912040000'), ('20260912050000')) as v(version)

    union all
    select 'ledger_head'::text, 'max'::text, coalesce(max(m.version)::text, 'none'), 'zz1'::text
    from supabase_migrations.schema_migrations m

    union all
    select 'ledger_total'::text, 'count'::text, count(*)::text, 'zz2'::text
    from supabase_migrations.schema_migrations m
) rows
order by sort_key;
