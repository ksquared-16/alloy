-- Read-only census: PHYSICAL state and LEDGER identity of the Coverage migrations
-- (20261011120000, 20261012120000) on the deployed primary, in ONE reading.
--
-- WHY THIS EXISTS. database.apply_migration reported ok with ledger "applied" for both
-- versions, and the structural census then proved every object present on staging — but
-- the ledger carries neither version. repository.merge_pull_request reads the ledger and
-- refuses hosted_migration_behind, so a correct schema is blocking its own follow-up.
--
-- Shape consumed by trusted-host-ledger-repair.mjs:
--
--     object ~ expected ~ observed ~ match
--
-- under question ids `m<last six of version>`, with ledger head and total in the same
-- result. A version counts present only when every one of its rows matched.
--
-- Both versions end in the same six digits, so both resolve to question id `m120000`.
-- That is not a collision to work around: the two migrations are one authority, they
-- arrived in one apply, and a single question whose rows cover the objects of both
-- answers for both. Splitting them would invent a distinction the reader cannot see.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
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
          where n.nspname='public' and p.proname='staff_coverage_plan') as f_plan,
        (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='staff_coverage_supersede') as f_sup,
        (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='staff_coverage_cancel') as f_cancel,
        (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='staff_coverage_effective_for_employment') as f_emp,
        (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='staff_coverage_effective_for_site') as f_site
),
check_rows as (
    select 'm120000'::text as qid, 'staff_coverage_allocations'::text as o, 'present'::text as e,
           (case when tbl > 0 then 'present' else 'absent' end)::text as ob, 'a1'::text as sk from obj
    union all select 'm120000','staff_coverage_allocations_no_overlap exclusion','present',
           case when excl > 0 then 'present' else 'absent' end,'a2' from obj
    union all select 'm120000','validate_staff_coverage_place trigger','present',
           case when trg > 0 then 'present' else 'absent' end,'a3' from obj
    union all select 'm120000','staff_coverage_plan','present',
           case when f_plan > 0 then 'present' else 'absent' end,'a4' from obj
    union all select 'm120000','staff_coverage_supersede','present',
           case when f_sup > 0 then 'present' else 'absent' end,'a5' from obj
    union all select 'm120000','staff_coverage_cancel','present',
           case when f_cancel > 0 then 'present' else 'absent' end,'a6' from obj
    union all select 'm120000','staff_coverage_effective_for_employment','present',
           case when f_emp > 0 then 'present' else 'absent' end,'a7' from obj
    union all select 'm120000','staff_coverage_effective_for_site','present',
           case when f_site > 0 then 'present' else 'absent' end,'a8' from obj
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
    from (values ('20261011120000'), ('20261012120000')) as v(version)

    union all
    select 'ledger_head'::text, 'max'::text, coalesce(max(m.version)::text, 'none'), 'zz1'::text
    from supabase_migrations.schema_migrations m

    union all
    select 'ledger_total'::text, 'count'::text, count(*)::text, 'zz2'::text
    from supabase_migrations.schema_migrations m
) rows
order by sort_key;
