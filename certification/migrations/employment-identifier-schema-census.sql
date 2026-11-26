-- Read-only census: does the staging database physically carry Slice 1's schema?
--
-- A migration ledger row says a file RAN. It does not say the column and the
-- indexes exist — a ledger entry and a physical schema are different facts, and
-- Slice 1's release ordering depends on the physical one. So this asks the
-- catalog directly and reports the ledger only as a cross-check.
--
-- Run BEFORE the merge it must answer "not yet", and AFTER the staging apply it
-- must answer "yes" to every row. Same bytes both times, so the two readings are
-- comparable; the census is filed in separate runs, which is what makes the
-- second one a real measurement rather than a replay.
--
-- Output obeys the trusted-host parser: question_id | kind | payload.
select question_id, kind, payload
from (
    select 'col_badge_number'::text, 'present'::text,
           (exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='employments'
                      and column_name='badge_number'))::text, 'a1'::text

    union all
    select 'ck_badge_not_blank'::text, 'present'::text,
           (exists (select 1 from pg_constraint
                    where conname='employments_badge_number_not_blank_check'
                      and conrelid='public.employments'::regclass))::text, 'a2'::text

    union all
    select 'idx_employee_number_unique'::text, 'present'::text,
           (exists (select 1 from pg_indexes where schemaname='public'
                      and indexname='employments_org_employee_number_unique'))::text, 'a3'::text

    union all
    select 'idx_badge_number_unique'::text, 'present'::text,
           (exists (select 1 from pg_indexes where schemaname='public'
                      and indexname='employments_org_badge_number_unique'))::text, 'a4'::text

    union all
    -- The index must be UNIQUE, partial, and normalized. A non-unique index with
    -- the right name would satisfy a name check and enforce nothing.
    select 'idx_employee_number_is_unique_partial'::text, 'present'::text,
           (coalesce((select indexdef like 'CREATE UNIQUE INDEX%'
                           and indexdef like '%lower(btrim(external_employee_id))%'
                           and indexdef like '%WHERE%'
                      from pg_indexes where schemaname='public'
                        and indexname='employments_org_employee_number_unique'), false))::text, 'a5'::text

    union all
    select 'idx_badge_number_is_unique_partial'::text, 'present'::text,
           (coalesce((select indexdef like 'CREATE UNIQUE INDEX%'
                           and indexdef like '%lower(btrim(badge_number))%'
                           and indexdef like '%WHERE%'
                      from pg_indexes where schemaname='public'
                        and indexname='employments_org_badge_number_unique'), false))::text, 'a6'::text

    union all
    select 'ledger_has_20260925120000'::text, 'present'::text,
           (exists (select 1 from supabase_migrations.schema_migrations
                    where version='20260925120000'))::text, 'a7'::text

    union all
    -- Existing rows must remain valid and readable after the change.
    select 'employments_total'::text, 'count'::text,
           (select count(*)::text from public.employments), 'a8'::text
) rows(question_id, kind, payload, sort_key)
order by sort_key;
