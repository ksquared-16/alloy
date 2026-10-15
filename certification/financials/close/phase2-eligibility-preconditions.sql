-- TERMINAL S3/S4 — CAN THE CLOCK ACTUALLY SEE THIS PERIOD, AND IS IT STILL OPEN?
--
-- Materializing a daily period is not enough. The close handler discovers work with
-- `findClosableBillingPeriods(orgId, todayYmd)` scoped to the occurrence's OWN org, so a period in a
-- different org from the registered close schedule would never be found — the handler would run,
-- correctly report nothing, and the terminal proof would fail for a reason that looks like a defect
-- but is a scoping mismatch. That precondition is checked here BEFORE waiting a day on it.
--
-- It also records the pre-boundary state §7 requires: while the period has not elapsed it must
-- remain OPEN, and nothing may have closed it early.
--
-- READ-ONLY.
--
-- q1  the certification periods, their org, and whether a close schedule covers that org
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'billing_period_id', bp.id,
           'period_key', bp.period_key,
           'customer_id', bp.customer_id,
           'org_id', bp.org_id,
           'cadence', bp.cadence,
           'starts_on', bp.starts_on,
           'ends_on', bp.ends_on,
           'status', bp.status,
           'closed_at', bp.closed_at,
           'close_actor', bp.close_actor,
           'closed_by', bp.closed_by,
           'calendar_scope', bp.calendar_scope,
           'calendar_policy_id', bp.calendar_policy_id,
           'calendar_snapshot', bp.calendar_snapshot,
           -- THE PRECONDITION: is there an active close schedule for THIS period's org?
           'close_schedule_for_this_org', (
               SELECT coalesce(json_agg(json_build_object(
                          'scheduled_work_id', w.id, 'is_active', w.is_active,
                          'recurrence_kind', w.recurrence_kind, 'next_due_at', w.next_due_at)), '[]'::json)
                 FROM public.scheduled_work w
                WHERE w.handler_key = 'financials.billing_period_close.evaluate'
                  AND w.org_id = bp.org_id),
           -- eligibility, computed by the DATABASE's own date rather than the model's
           'db_current_date', current_date,
           'elapsed_now', (bp.ends_on < current_date),
           'becomes_eligible_on', (bp.ends_on + 1)
       )::text AS payload
  FROM public.financial_billing_periods bp
 WHERE bp.customer_id::text = 'fd000000-0000-4000-8000-0000000c0003'

UNION ALL

-- q2  every registered close schedule, so a scoping mismatch is visible rather than inferred
SELECT 'q2', 'row',
       json_build_object(
           'scheduled_work_id', w.id,
           'org_id', w.org_id,
           'handler_key', w.handler_key,
           'recurrence_kind', w.recurrence_kind,
           'is_active', w.is_active,
           'next_due_at', w.next_due_at,
           'seconds_until_due', round(extract(epoch FROM (w.next_due_at - now()))),
           'label', w.label
       )::text
  FROM public.scheduled_work w
 WHERE w.handler_key = 'financials.billing_period_close.evaluate'

UNION ALL

-- q3  what the handler WOULD find today, in every org — the discovery query's own shape
SELECT 'q3', 'row',
       json_build_object(
           'org_id', bp.org_id,
           'open_and_elapsed_today', count(*),
           'period_keys', json_agg(bp.period_key ORDER BY bp.ends_on)
       )::text
  FROM public.financial_billing_periods bp
 WHERE bp.status = 'open' AND bp.ends_on < current_date
 GROUP BY bp.org_id

UNION ALL

-- q4  §13 — is the certification period empty? Stated explicitly, because an empty period is a
--     canonically valid commercial period and closing one is not a weaker proof.
SELECT 'q4', 'row',
       json_build_object(
           'billing_period_id', bp.id,
           'period_key', bp.period_key,
           'charges_in_period', (SELECT count(*) FROM public.charges c
                                  WHERE c.billing_period_id = bp.id),
           'reductions_in_period', (SELECT count(*) FROM public.financial_reduction_applications r
                                     WHERE r.billing_period_id = bp.id),
           'is_empty', (NOT EXISTS (SELECT 1 FROM public.charges c2 WHERE c2.billing_period_id = bp.id)
                        AND NOT EXISTS (SELECT 1 FROM public.financial_reduction_applications r2
                                         WHERE r2.billing_period_id = bp.id))
       )::text
  FROM public.financial_billing_periods bp
 WHERE bp.customer_id::text = 'fd000000-0000-4000-8000-0000000c0003'
   AND bp.starts_on >= '2026-10-01' AND bp.starts_on < '2026-11-01'

ORDER BY 1
