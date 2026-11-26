-- REGISTER AUTOMATIC COMMERCIAL CLOSE ON THE EXISTING SCHEDULED-WORK CLOCK.
--
-- This migration adds no table, no column and no behaviour. It registers a NAME on the clock that
-- already runs — `financials.billing_period_close.evaluate` — which resolves to the handler in
-- `scheduledWorkConsumers` or it resolves to nothing. Configuration cannot introduce behaviour: an
-- unregistered key fails terminally and stays visible, which is the property that makes inserting a
-- row here safe rather than a way to run arbitrary work.
--
-- WHY A MIGRATION. The clock reads `scheduled_work`, and there is no product surface that registers
-- a platform schedule. This is the same path the periodic-billing and clock-activation schedules
-- took, so automatic close arrives the way its siblings did instead of by a bespoke mechanism.
--
-- WHY ONE ROW PER ORG THAT ALREADY HAS CANONICAL PERIODS. The handler refuses an occurrence with no
-- tenant — null `org_id` means "no tenant", never "every organisation" — so a platform-wide row
-- would wake and close nothing. Scoping to orgs that actually hold `financial_billing_periods` rows
-- means no org acquires a finalization schedule before it has anything to finalize, and an org that
-- adopts canonical periods later is picked up by a later run of this same guarded insert.
--
-- DAILY, not every five minutes. A commercial period boundary moves once a day; asking more often
-- would be 288 reads a day to answer a question that can change once.
--
-- RE-RUNNABLE. The `where not exists` is keyed on (org_id, handler_key), so applying this twice
-- registers nothing twice — and a failed apply does not roll back DDL, so re-runnability is the
-- property that makes a retry safe.

insert into public.scheduled_work (
    org_id,
    handler_key,
    recurrence_kind,
    next_due_at,
    is_active,
    label,
    domain_ref
)
select
    distinct_orgs.org_id,
    'financials.billing_period_close.evaluate',
    'daily',
    /*
     * The next boundary check, not an immediate one. A period becomes eligible the day AFTER it
     * ends, so the first useful wake is tomorrow; scheduling it in the past would spend an
     * occurrence discovering that nothing has elapsed since the last one.
     */
    date_trunc('day', now() at time zone 'UTC') + interval '1 day' + interval '4 hours',
    true,
    'billing_period_commercial_close',
    jsonb_build_object(
        'purpose', 'close customer billing periods whose commercial interval has elapsed',
        'authority', 'closeBillingPeriod',
        'close_actor', 'system'
    )
from (
    select distinct bp.org_id
      from public.financial_billing_periods bp
) as distinct_orgs
where not exists (
    select 1
      from public.scheduled_work existing
     where existing.org_id = distinct_orgs.org_id
       and existing.handler_key = 'financials.billing_period_close.evaluate'
);

-- ── SELF-TEST ────────────────────────────────────────────────────────────────────────────────────
--
-- Asserts the registration is coherent rather than that a row was written: an org holding canonical
-- periods must now have exactly one active close schedule, and it must be daily. A count of zero is
-- legitimate on a database with no canonical periods yet, so the test is conditional on there being
-- something to schedule.
do $$
declare
    orgs_with_periods integer;
    close_schedules integer;
    non_daily integer;
    duplicate_orgs integer;
begin
    select count(distinct org_id) into orgs_with_periods from public.financial_billing_periods;

    select count(*) into close_schedules
      from public.scheduled_work
     where handler_key = 'financials.billing_period_close.evaluate';

    if orgs_with_periods > 0 and close_schedules < 1 then
        raise exception
            'billing period close schedule missing: % org(s) hold canonical periods but no close schedule was registered',
            orgs_with_periods;
    end if;

    select count(*) into non_daily
      from public.scheduled_work
     where handler_key = 'financials.billing_period_close.evaluate'
       and (recurrence_kind <> 'daily' or is_active is not true or org_id is null);

    if non_daily > 0 then
        raise exception
            'billing period close schedule misconfigured: % row(s) are not an active daily tenant schedule',
            non_daily;
    end if;

    -- One schedule per org. Two would close the same periods twice per day; the close service is
    -- idempotent so no period would transition twice, but the duplicate work would be invisible waste.
    select count(*) into duplicate_orgs
      from (
          select org_id
            from public.scheduled_work
           where handler_key = 'financials.billing_period_close.evaluate'
           group by org_id
          having count(*) > 1
      ) dupes;

    if duplicate_orgs > 0 then
        raise exception 'billing period close schedule duplicated for % org(s)', duplicate_orgs;
    end if;
end $$;
