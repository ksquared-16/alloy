-- Re-measure ONLY the hosted migration ledger, after a governed ledger repair.
--
-- repository.merge_pull_request refused hosted_migration_evidence_stale: a
-- database.repair_migration_ledger completed after the previous physical-state
-- census, so that census no longer describes the state the merge would act on.
-- A repair authorised against a state must execute against that state, and two
-- readings minutes apart are two states.
--
-- Same shape the repair reader consumes, so this artifact can serve either gate:
-- `m<last six of version>` physical rows, ledger_version identity rows, head and
-- total, all from one reading.
with obj as (
    select
        (select count(*) from information_schema.tables
          where table_schema='public' and table_name='staff_coverage_allocations') as tbl,
        (select count(*) from pg_constraint
          where conrelid = to_regclass('public.staff_coverage_allocations') and contype='x') as excl,
        (select count(*) from pg_trigger
          where tgrelid = to_regclass('public.staff_coverage_allocations')
            and not tgisinternal and tgname='validate_staff_coverage_place') as trg,
        (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname like 'staff\_coverage\_%') as fns
),
check_rows as (
    select 'm120000'::text as qid, 'staff_coverage_allocations'::text as o, 'present'::text as e,
           (case when tbl > 0 then 'present' else 'absent' end)::text as ob, 'a1'::text as sk from obj
    union all select 'm120000','staff_coverage_allocations_no_overlap exclusion','present',
           case when excl > 0 then 'present' else 'absent' end,'a2' from obj
    union all select 'm120000','validate_staff_coverage_place trigger','present',
           case when trg > 0 then 'present' else 'absent' end,'a3' from obj
    union all select 'm120000','staff_coverage RPCs: five','present',
           case when fns = 5 then 'present' else 'absent' end,'a4' from obj
)
select question_id, kind, payload
from (
    select qid as question_id, 'physical'::text as kind,
           (o || ' ~ ' || e || ' ~ ' || ob || ' ~ ' ||
            (case when ob = e then 'true' else 'false' end))::text as payload,
           sk as sort_key
    from check_rows
    union all
    select 'ledger_version'::text, 'identity'::text,
           (v.version || ' ~ ledgered ~ ' ||
            (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                  then 'present' else 'absent' end) || ' ~ ' ||
            (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                  then 'true' else 'false' end))::text,
           'b' || v.version
    from (values ('20261011120000'), ('20261012120000'), ('20261013120000')) as v(version)
    union all
    select 'ledger_head'::text, 'max'::text, coalesce(max(m.version)::text, 'none'), 'zz1'::text
    from supabase_migrations.schema_migrations m
    union all
    select 'ledger_total'::text, 'count'::text, count(*)::text, 'zz2'::text
    from supabase_migrations.schema_migrations m
) rows
order by sort_key;
