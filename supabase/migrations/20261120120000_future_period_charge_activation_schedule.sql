-- REGISTER FUTURE-PERIOD CHARGE ACTIVATION ON THE CLOCK THAT ALREADY RUNS.
--
-- W7-F001 confirmed the intended charge lifecycle: a charge in the CURRENT billing period posts
-- immediately (subject to a configured `posting_review` boundary), a charge in a FUTURE billing
-- period is a draft and is not financially effective, and when that period BEGINS the charge posts
-- automatically. `postChildcareCharge` now refuses the early post and labels the draft
-- `metadata.post_gate = 'period_not_started'`. This registers the thing that clears that label.
--
-- NO TABLE, NO COLUMN, NO BEHAVIOUR. It registers a NAME —
-- `financials.future_period_charge.activate` — which resolves to the handler in
-- `scheduledWorkConsumers` or it resolves to nothing. An unregistered key fails terminally and
-- stays visible, which is the property that makes inserting a row here safe rather than a way to
-- run arbitrary work. The same path automatic close took one migration earlier.
--
-- ── WHY 11:30 UTC, AND WHY HALF AN HOUR BEFORE CLOSE ──
--
-- A period begins at LOCAL midnight, so a wake before local midnight finds the business date still
-- yesterday and activates nothing. 11:30 UTC clears local midnight for every zone at or east of
-- UTC−11:30 — the deployed estate is America/Los_Angeles (UTC−7/−8, local midnight 07:00/08:00 UTC),
-- so activation happens the same local morning the period opened, with the same headroom the close
-- schedule documented.
--
-- It is deliberately 30 minutes BEFORE the 12:00 UTC close wake. Consider a draft waiting on a
-- period that both began and ended while it waited — a backlog, a long outage. If close ran first it
-- would finalize that period and the draft could then never post legally, becoming attention work
-- for a reason that was the scheduler's timing rather than the business's. Activating first gives
-- every eligible draft its lawful chance before finality is applied. The ordering costs nothing on
-- an ordinary day, when activation finds nothing and close finds nothing.
--
-- ── WHY ONE ROW PER ORG THAT HOLDS CANONICAL PERIODS ──
--
-- The handler refuses an occurrence with no tenant — null `org_id` means "no tenant", never "every
-- organisation" — so a platform-wide row would wake and activate nothing. Scoping to orgs that
-- actually hold `financial_billing_periods` rows means no org acquires an activation schedule before
-- it has a period to activate into, and an org that adopts canonical periods later is picked up by a
-- later run of this same guarded insert.
--
-- DAILY. A period boundary moves once a day.
--
-- RE-RUNNABLE. The `where not exists` is keyed on (org_id, handler_key), and a failed apply does not
-- roll back DDL, so re-runnability is the property that makes a retry safe.

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
    'financials.future_period_charge.activate',
    'daily',
    /*
     * Tomorrow at 11:30 UTC. `computeNextDueAt('daily', dueAt)` advances from the DUE time, so this
     * anchor is permanent and must be the time of day we actually want. Scheduling it in the past
     * would spend an occurrence discovering that nothing has begun since the last one.
     */
    date_trunc('day', now() at time zone 'UTC') + interval '1 day' + interval '11 hours 30 minutes',
    true,
    'future_period_charge_activation',
    jsonb_build_object(
        'purpose', 'post draft charges whose billing period has begun, on the organisation business date',
        'authority', 'postChildcareCharge via autoPostGeneratedCharge',
        'gate', 'period_not_started',
        'actor', 'system'
    )
from (
    select distinct bp.org_id
      from public.financial_billing_periods bp
) as distinct_orgs
where not exists (
    select 1
      from public.scheduled_work existing
     where existing.org_id = distinct_orgs.org_id
       and existing.handler_key = 'financials.future_period_charge.activate'
);

-- ── SELF-TEST ────────────────────────────────────────────────────────────────────────────────────
--
-- Asserts the registration is COHERENT rather than that a row was written. A count of zero is
-- legitimate on a database with no canonical periods, so the existence test is conditional on there
-- being something to schedule; the shape tests are not conditional, because a misconfigured row is
-- wrong whether or not one was needed.
do $$
declare
    orgs_with_periods integer;
    activation_schedules integer;
    misconfigured integer;
    duplicate_orgs integer;
    wrong_time integer;
begin
    select count(distinct org_id) into orgs_with_periods from public.financial_billing_periods;

    select count(*) into activation_schedules
      from public.scheduled_work
     where handler_key = 'financials.future_period_charge.activate';

    if orgs_with_periods > 0 and activation_schedules < 1 then
        raise exception
            'future-period activation schedule missing: % org(s) hold canonical periods but no activation schedule was registered',
            orgs_with_periods;
    end if;

    select count(*) into misconfigured
      from public.scheduled_work
     where handler_key = 'financials.future_period_charge.activate'
       and (recurrence_kind <> 'daily' or is_active is not true or org_id is null);

    if misconfigured > 0 then
        raise exception
            'future-period activation schedule misconfigured: % row(s) are not an active daily tenant schedule',
            misconfigured;
    end if;

    -- One schedule per org. Two would evaluate the same drafts twice a day; posting is idempotent so
    -- nothing would post twice, but the duplicate work would be invisible waste.
    select count(*) into duplicate_orgs
      from (
          select org_id
            from public.scheduled_work
           where handler_key = 'financials.future_period_charge.activate'
           group by org_id
          having count(*) > 1
      ) dupes;

    if duplicate_orgs > 0 then
        raise exception 'future-period activation schedule duplicated for % org(s)', duplicate_orgs;
    end if;

    -- The time of day is the whole point of the anchor: a wake before local midnight activates
    -- nothing, and a wake after the close wake can be beaten to a period by finality.
    select count(*) into wrong_time
      from public.scheduled_work
     where handler_key = 'financials.future_period_charge.activate'
       and (
            extract(hour from next_due_at at time zone 'UTC') <> 11
         or extract(minute from next_due_at at time zone 'UTC') <> 30
       );

    if wrong_time > 0 then
        raise exception
            'future-period activation schedule is not anchored at 11:30 UTC: % row(s) wake at another time',
            wrong_time;
    end if;
end $$;
