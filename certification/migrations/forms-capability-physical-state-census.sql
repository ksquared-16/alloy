-- Read-only census: PHYSICAL state and LEDGER identity of the two Forms capability migrations
-- (20260912020000, 20260912030000) on the deployed primary, in ONE reading.
--
-- WHY THIS EXISTS. `post_apply_verification_failed` is only reachable AFTER the migration runner
-- reports success, so it never means "nothing happened" — it means the schema may be there while
-- the ledger row is not. This lane has now seen that three times (D2, W-17, and here), and
-- diagnosing it requires physical and ledger state read at the SAME moment, in the shape
-- `trusted-host-ledger-repair.mjs` consumes:
--
--     object ~ expected ~ observed ~ match
--
-- under question ids `m<last six of version>`, with the ledger head and total in the same result.
-- A version counts as present only when every one of its rows matched.
--
-- WHAT EACH VERSION IS ASKED FOR. 20260912020000 defines the three capabilities and the
-- compatibility grants, so its physical evidence is the catalog rows plus the SHAPE of those
-- grants — `admin` holding all three and `ops` holding only `forms.submissions.confirm`. A census
-- that only counted catalog rows would call a half-applied migration applied.
--
-- 20260912030000 rewrites `seed_default_rbac` so a NEW organization is born with the same grants,
-- so its evidence is the function's own text and the trigger that calls it. Reading
-- `pg_get_functiondef` is what makes this a statement about the installed function rather than
-- about the repository.
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
orgs_with_admin as (
    select count(*)::bigint as n from public.role_definitions rd
    where rd.role_key = 'admin' and rd.is_active
),
orgs_admin_full as (
    select count(*)::bigint as n from (
        select g.org_id from public.role_permission_grants g
        where g.role_key = 'admin'
          and g.permission_key in ('forms.author', 'forms.submissions', 'forms.submissions.confirm')
        group by g.org_id having count(distinct g.permission_key) = 3
    ) t
),
ops_widened as (
    select count(*)::bigint as n from public.role_permission_grants g
    where g.role_key = 'ops' and g.permission_key in ('forms.author', 'forms.submissions')
),
check_rows as (
    -- 20260912020000 — the capability model itself.
    select 'm020000'::text as qid, 'forms.author in catalog'::text as obj, 'present'::text as expected,
           (case when exists (select 1 from public.permission_definitions d where d.key = 'forms.author' and d.is_active)
                 then 'present' else 'absent' end)::text as observed,
           'a1'::text as sort_key
    union all
    select 'm020000', 'forms.submissions in catalog', 'present',
           case when exists (select 1 from public.permission_definitions d where d.key = 'forms.submissions' and d.is_active)
                then 'present' else 'absent' end, 'a2'
    union all
    select 'm020000', 'forms.submissions.confirm in catalog', 'present',
           case when exists (select 1 from public.permission_definitions d where d.key = 'forms.submissions.confirm' and d.is_active)
                then 'present' else 'absent' end, 'a3'
    union all
    select 'm020000', 'all three carry the forms group', 'yes',
           case when (select count(*) from public.permission_definitions d
                      where d.key in ('forms.author', 'forms.submissions', 'forms.submissions.confirm')
                        and d.group_key = 'forms') = 3 then 'yes' else 'no' end, 'a4'
    union all
    -- Compatibility, both halves. Every org that has an active admin role must hold all three.
    select 'm020000', 'every admin role holds all three', 'yes',
           case when (select n from orgs_admin_full) >= (select n from orgs_with_admin) then 'yes' else 'no' end, 'a5'
    union all
    -- And ops must not have been widened past the one write it already had.
    select 'm020000', 'ops holds neither author nor submissions', 'yes',
           case when (select n from ops_widened) = 0 then 'yes' else 'no' end, 'a6'

    -- 20260912030000 — a NEW organization is born with the same grants.
    union all
    select 'm030000', 'seed_default_rbac exists', 'present',
           case when (select length(def) from src) > 0 then 'present' else 'absent' end, 'b1'
    union all
    select 'm030000', 'admin enumeration carries forms.author', 'yes',
           case when (select strpos(admin_region, '''forms.author''') from regions) > 0 then 'yes' else 'no' end, 'b2'
    union all
    select 'm030000', 'admin enumeration carries forms.submissions', 'yes',
           case when (select strpos(admin_region, '''forms.submissions''') from regions) > 0 then 'yes' else 'no' end, 'b3'
    union all
    select 'm030000', 'admin enumeration carries forms.submissions.confirm', 'yes',
           case when (select strpos(admin_region, '''forms.submissions.confirm''') from regions) > 0 then 'yes' else 'no' end, 'b4'
    union all
    select 'm030000', 'ops enumeration carries forms.submissions.confirm', 'yes',
           case when (select strpos(ops_region, '''forms.submissions.confirm''') from regions) > 0 then 'yes' else 'no' end, 'b5'
    union all
    -- The exclusion is an ABSENCE, which is exactly the kind of thing an editor restores by accident.
    select 'm030000', 'ops enumeration withholds forms.author', 'yes',
           case when (select strpos(ops_region, '''forms.author''') from regions) = 0 then 'yes' else 'no' end, 'b6'
    union all
    select 'm030000', 'orgs_seed_default_rbac trigger present', 'present',
           case when exists (select 1 from pg_trigger t where t.tgname = 'orgs_seed_default_rbac' and not t.tgisinternal)
                then 'present' else 'absent' end, 'b7'
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
    from (values ('20260912020000'), ('20260912030000')) as v(version)

    union all
    select 'ledger_head'::text, 'max'::text, coalesce(max(m.version)::text, 'none'), 'zz1'::text
    from supabase_migrations.schema_migrations m

    union all
    select 'ledger_total'::text, 'count'::text, count(*)::text, 'zz2'::text
    from supabase_migrations.schema_migrations m
) rows
order by sort_key;
