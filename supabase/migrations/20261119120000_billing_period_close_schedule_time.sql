-- COMMERCIAL CLOSE WAKES AFTER LOCAL MIDNIGHT, NOT BEFORE IT.
--
-- ── THE MEASURED PROBLEM ─────────────────────────────────────────────────────────────────────
--
-- The close schedule was anchored at 04:00 UTC. A period ending on local date D becomes eligible
-- when the organisation's business date is D+1, which begins at LOCAL midnight — and the deployed
-- estate is `America/Los_Angeles`, whose local midnight falls at 07:00 UTC on daylight time and
-- 08:00 UTC on standard time. 04:00 UTC is before both, so the wake correctly found the business
-- date still D, declined, and the close landed at the NEXT wake — about 24 hours later than
-- necessary.
--
-- That was certified as economically safe: never early, only late. This removes the lateness
-- without touching anything that made it safe.
--
-- ── WHY 12:00 UTC ────────────────────────────────────────────────────────────────────────────
--
-- Measured, not assumed. The deployed census found ONE organisation holding canonical billing
-- periods, in one zone, at UTC−7/−8. 12:00 UTC is 04:00 PST / 05:00 PDT — comfortably after local
-- midnight in both halves of the year, so close happens the same local morning the period became
-- eligible.
--
-- It also carries real headroom rather than fitting the current estate exactly: a wake at 12:00 UTC
-- clears local midnight for every zone at or east of UTC−12, which is the whole inhabited range.
-- Hawaii (UTC−10, local midnight 10:00 UTC) and American Samoa (UTC−11, 11:00 UTC) would both still
-- be served correctly without revisiting this.
--
-- ── WHAT THIS DOES NOT CHANGE ────────────────────────────────────────────────────────────────
--
-- Only the time of day. The same `scheduled_work` row, the same handler
-- (`financials.billing_period_close.evaluate`), the same daily cadence, the same `closeBillingPeriod`
-- authority, the same eligibility rule, the same period bounds, and the same business-date
-- semantics decide everything else. No second schedule is created — `computeNextDueAt` advances a
-- daily row by exactly 24 hours from its due time, so moving the anchor once moves it permanently.
--
-- RE-RUNNABLE. Only rows not already anchored at 12:00 UTC are touched, so a repeat apply is a
-- no-op rather than a fresh 24-hour push-out.

update public.scheduled_work
   set next_due_at = (
           -- The next 12:00 UTC at or after now: today's if it is still ahead, otherwise tomorrow's.
           case
             when now() at time zone 'UTC' < date_trunc('day', now() at time zone 'UTC') + interval '12 hours'
               then date_trunc('day', now() at time zone 'UTC') + interval '12 hours'
             else date_trunc('day', now() at time zone 'UTC') + interval '1 day' + interval '12 hours'
           end
       ),
       updated_at = now()
 where handler_key = 'financials.billing_period_close.evaluate'
   and is_active
   and extract(hour from next_due_at at time zone 'UTC') <> 12;

-- ── SELF-TEST ────────────────────────────────────────────────────────────────────────────────
do $$
declare
    off_time    integer;
    not_daily   integer;
    duplicated  integer;
    inactive_ok integer;
begin
    select count(*) into off_time
      from public.scheduled_work
     where handler_key = 'financials.billing_period_close.evaluate'
       and is_active
       and extract(hour from next_due_at at time zone 'UTC') <> 12;
    if off_time > 0 then
        raise exception 'billing period close schedule: % active row(s) are not anchored at 12:00 UTC', off_time;
    end if;

    -- The cadence must be untouched. A row that stopped being daily would be a different schedule.
    select count(*) into not_daily
      from public.scheduled_work
     where handler_key = 'financials.billing_period_close.evaluate'
       and is_active
       and recurrence_kind <> 'daily';
    if not_daily > 0 then
        raise exception 'billing period close schedule: % active row(s) are no longer daily', not_daily;
    end if;

    -- And no second schedule may have appeared. Two would close the same periods twice per day.
    select count(*) into duplicated
      from (
          select org_id
            from public.scheduled_work
           where handler_key = 'financials.billing_period_close.evaluate'
             and is_active
           group by org_id
          having count(*) > 1
      ) d;
    if duplicated > 0 then
        raise exception 'billing period close schedule duplicated for % org(s)', duplicated;
    end if;

    -- An org holding canonical periods must still have its schedule. This migration moves rows; it
    -- must never have removed one.
    select count(*) into inactive_ok
      from (select distinct org_id from public.financial_billing_periods) bp
     where not exists (
         select 1 from public.scheduled_work sw
          where sw.org_id = bp.org_id
            and sw.handler_key = 'financials.billing_period_close.evaluate'
            and sw.is_active
     );
    if inactive_ok > 0 then
        raise exception 'billing period close schedule missing for % org(s) holding canonical periods', inactive_ok;
    end if;
end $$;
