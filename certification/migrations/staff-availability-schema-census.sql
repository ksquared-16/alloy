-- Read-only census: does the database PHYSICALLY carry Slice 4's availability
-- authority, and is it actually isolated per tenant?
--
-- CATALOG ONLY. Slice 3 taught this the expensive way: a single
-- `select count(*) from public.<new_table>` fails the WHOLE census with
-- "relation does not exist" when the table is absent, because Postgres plans the
-- statement before running it — and absent is exactly the state a schema census
-- exists to report. Nothing here selects from a Slice 4 table.
--
-- The RLS rows are a GATE, not a report. These tables were created with RLS in
-- the same migration; if that ever regresses, `authenticated` holds SELECT on
-- every new table in `public` by default and the pattern becomes readable across
-- every organization.
--
-- Output obeys the trusted-host parser: question_id | kind | payload.
select question_id, kind, payload
from (
    select 'tbl_windows'::text, 'present'::text,
           (to_regclass('public.staff_availability_windows') is not null)::text, 'a01'::text
    union all
    select 'tbl_exceptions'::text, 'present'::text,
           (to_regclass('public.staff_availability_exceptions') is not null)::text, 'a02'::text

    -- ── THE CONSTRAINTS THAT CARRY THE MEANING ──
    union all
    select 'ck_windows_weekday_range'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_availability_windows_weekday_range'))::text, 'a03'::text
    union all
    -- Without this a window can end before it starts, and every resolver has to
    -- guess which day the end belongs to.
    select 'ck_windows_time_order'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_availability_windows_time_order'))::text, 'a04'::text
    union all
    select 'ck_windows_effective_order'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_availability_windows_effective_order'))::text, 'a05'::text
    union all
    select 'ck_exceptions_kind'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_availability_exceptions_kind_check'))::text, 'a06'::text
    union all
    -- The shape follows the kind: an unavailable row cannot smuggle times, and an
    -- available row cannot omit them.
    select 'ck_exceptions_shape'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='staff_availability_exceptions_shape_check'))::text, 'a07'::text

    -- ── NO UNIQUE ON WEEKDAY — split windows depend on its ABSENCE ──
    union all
    select 'no_unique_on_weekday'::text, 'present'::text,
           (not exists (select 1 from pg_constraint
                        where conrelid=to_regclass('public.staff_availability_windows')
                          and contype='u'))::text, 'a08'::text

    -- ── KEYS, GRAIN AND SCOPE ──
    union all
    select 'pk_windows'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conrelid=to_regclass('public.staff_availability_windows')
                      and contype='p'))::text, 'a09'::text
    union all
    select 'pk_exceptions'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conrelid=to_regclass('public.staff_availability_exceptions')
                      and contype='p'))::text, 'a10'::text
    union all
    select 'fk_org_both'::text, 'count'::text,
           (select count(*)::text from pg_constraint c
            where c.contype='f' and c.confrelid=to_regclass('public.orgs')
              and c.conrelid in (to_regclass('public.staff_availability_windows'),
                                 to_regclass('public.staff_availability_exceptions'))), 'a11'::text
    union all
    -- EMPLOYMENT, never Person: one human can work for two organizations with
    -- different availability at each.
    select 'fk_employment_both'::text, 'count'::text,
           (select count(*)::text from pg_constraint c
            where c.contype='f' and c.confrelid=to_regclass('public.employments')
              and c.conrelid in (to_regclass('public.staff_availability_windows'),
                                 to_regclass('public.staff_availability_exceptions'))), 'a12'::text
    union all
    select 'no_person_id_column'::text, 'present'::text,
           (not exists (select 1 from information_schema.columns
                        where table_schema='public'
                          and table_name in ('staff_availability_windows','staff_availability_exceptions')
                          and column_name='person_id'))::text, 'a13'::text
    union all
    select 'org_id_not_null_both'::text, 'count'::text,
           (select count(*)::text from information_schema.columns
            where table_schema='public'
              and table_name in ('staff_availability_windows','staff_availability_exceptions')
              and column_name='org_id' and is_nullable='NO'), 'a14'::text

    -- ── INDEXES THE RESOLUTION DEPENDS ON ──
    union all
    select 'idx_windows_employment'::text, 'present'::text,
           (exists (select 1 from pg_indexes where schemaname='public'
                      and indexname='staff_availability_windows_employment_idx'))::text, 'a15'::text
    union all
    select 'idx_windows_effective'::text, 'present'::text,
           (exists (select 1 from pg_indexes where schemaname='public'
                      and indexname='staff_availability_windows_effective_idx'))::text, 'a16'::text
    union all
    select 'idx_exceptions_date'::text, 'present'::text,
           (exists (select 1 from pg_indexes where schemaname='public'
                      and indexname='staff_availability_exceptions_employment_date_idx'))::text, 'a17'::text

    -- ── ROW SECURITY — EXPECTED TRUE, AND THE PREDICATES CHECKED ──
    union all
    select 'rls_enabled_windows'::text, 'present'::text,
           (select relrowsecurity::text from pg_class
            where oid=to_regclass('public.staff_availability_windows')), 'a18'::text
    union all
    select 'rls_enabled_exceptions'::text, 'present'::text,
           (select relrowsecurity::text from pg_class
            where oid=to_regclass('public.staff_availability_exceptions')), 'a19'::text
    union all
    select 'policies_total'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public' and tablename like 'staff_availability%'), 'a20'::text
    union all
    select 'select_policies_org_scoped'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public' and tablename like 'staff_availability%'
              and cmd='SELECT' and coalesce(qual,'') like '%has_org_role(org_id%'), 'a21'::text
    union all
    -- The one a bare count cannot give: a policy whose USING is `true` passes any
    -- count and defeats the boundary entirely.
    select 'permissive_true_policies'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public' and tablename like 'staff_availability%'
              and (btrim(coalesce(qual,'')) = 'true' or btrim(coalesce(with_check,'')) = 'true')), 'a22'::text
    union all
    select 'write_policies_naming_manager'::text, 'count'::text,
           (select count(*)::text from pg_policies
            where schemaname='public' and tablename like 'staff_availability%'
              and cmd in ('INSERT','UPDATE','DELETE')
              and coalesce(qual,'')||coalesce(with_check,'') like '%manager%'), 'a23'::text
    union all
    -- Reported as its own fact so nobody reads the write policies as the thing
    -- refusing an authenticated write: the GRANT is.
    select 'authenticated_write_grants'::text, 'count'::text,
           (select count(*)::text from information_schema.role_table_grants
            where table_schema='public' and grantee='authenticated'
              and table_name like 'staff_availability%'
              and privilege_type in ('INSERT','UPDATE','DELETE')), 'a24'::text

    -- ── NEGATIVE INVARIANTS AND NON-REGRESSION ──
    union all
    select 'no_is_ready_column'::text, 'present'::text,
           (not exists (select 1 from information_schema.columns
                        where table_schema='public'
                          and table_name like 'staff_availability%'
                          and column_name = 'is_ready'))::text, 'a25'::text
    union all
    -- Availability must not have acquired a schedule or presence column: the
    -- authorities stay separate.
    select 'no_schedule_or_presence_columns'::text, 'present'::text,
           (not exists (select 1 from information_schema.columns
                        where table_schema='public'
                          and table_name like 'staff_availability%'
                          and column_name in ('schedule_assignment_id','presence_event_id',
                                              'site_location_id','shift_id')))::text, 'a26'::text
    union all
    select 'ledger_has_20260927120000'::text, 'present'::text,
           (exists (select 1 from supabase_migrations.schema_migrations
                    where version='20260927120000'))::text, 'a27'::text
    union all
    select 'employments_total'::text, 'count'::text,
           (select count(*)::text from public.employments), 'a28'::text
) rows(question_id, kind, payload, sort_key)
order by sort_key;
