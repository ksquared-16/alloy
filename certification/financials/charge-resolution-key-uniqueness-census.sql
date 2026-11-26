-- ============================================================================================
-- CAN `charges_resolution_key_unique` BE CREATED ON THE DEPLOYED DATABASE?
--
-- The migration states one charge per `metadata.resolution_key` per billable source. If the
-- deployed data already holds a violation — two charges written by the very race the migration
-- closes — CREATE UNIQUE INDEX fails and the deploy fails with it. That is a question about
-- money that already exists, so it is asked before the merge, not discovered after it.
--
-- Read-only. Three answers:
--   org_exists      the tenant census scope is real (an all-zero result must not be read as
--                   "clean" when it could mean "wrong scope")
--   keyed_charges   how many charges carry a resolution key at all
--   violations      how many (org, source_type, source_id, resolution_key) groups hold more
--                   than one charge — this must be ZERO for the migration to apply
-- ============================================================================================

with keyed as (
    select
        org_id,
        billable_source_type,
        billable_source_id,
        metadata ->> 'resolution_key' as resolution_key,
        id,
        status
    from public.charges
    where metadata ->> 'resolution_key' is not null
      and billable_source_id is not null
),
groups as (
    select
        org_id,
        billable_source_type,
        billable_source_id,
        resolution_key,
        count(*) as charge_count,
        count(*) filter (where status = 'posted') as posted_count
    from keyed
    group by 1, 2, 3, 4
)
-- ONE LABELLED TEXT COLUMN, deliberately. The census transport renders rows in a positional
-- `a|b|c` shape, and a seven-column answer came back with five values — unreadable, and a money
-- guarantee must not be read by guessing which column went missing. Each number carries its own
-- name, so the answer means the same thing however it is rendered.
select
    'org_exists='            || (select count(*) from public.orgs)
 || '; charges_total='       || (select count(*) from public.charges)
 || '; keyed_charges='       || (select count(*) from keyed)
 || '; distinct_keys='       || (select count(*) from groups)
 || '; VIOLATIONS='          || (select count(*) from groups where charge_count > 1)
 || '; worst_group='         || (select coalesce(max(charge_count), 0) from groups)
 || '; posted_in_violations='|| (select coalesce(sum(posted_count), 0) from groups where charge_count > 1)
    as census;
