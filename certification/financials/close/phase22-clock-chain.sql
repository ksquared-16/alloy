-- PHASE 22 — IS THE AUTOMATIC-CLOSE CHAIN REGISTERED AND RUNNING ON THE REAL CLOCK?
--
-- The terminal proof is a REAL scheduled close: schedule → occurrence → claim/lease → handler
-- attempt → canonical close → status transition, exactly once, with nothing manufactured.
--
-- This census measures how far that chain has actually got. It deliberately separates three
-- different answers, because they mean different things and only one of them is a problem:
--
--   REGISTERED  — the schedule row exists and is active. Migration 20261118120000 did its job.
--   WOKEN       — an occurrence exists with a real worker attempt. The clock owns it.
--   TRANSITIONED— a period actually moved open → closed by close_actor = 'system'. Terminal.
--
-- A woken chain that closed nothing is NOT a failure if nothing was eligible. So the census also
-- reports whether any OPEN canonical period has elapsed, which is the difference between "the
-- handler is broken" and "there was correctly nothing to do".
--
-- READ-ONLY.
--
-- q1  the registration itself
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'scheduled_work_id', w.id,
           'org_id', w.org_id,
           'handler_key', w.handler_key,
           'recurrence_kind', w.recurrence_kind,
           'is_active', w.is_active,
           'label', w.label,
           'next_due_at', w.next_due_at,
           'seconds_until_due', round(extract(epoch FROM (w.next_due_at - now()))),
           'domain_ref', w.domain_ref
       )::text AS payload
  FROM public.scheduled_work w
 WHERE w.handler_key = 'financials.billing_period_close.evaluate'

UNION ALL

-- q2  the durable chain, if the clock has reached it yet
SELECT 'q2', 'row',
       json_build_object(
           'occurrence_id', o.id,
           'due_at', o.due_at,
           'status', o.status,
           'claimed_by', o.claimed_by,
           'lease_expires_at', o.lease_expires_at,
           'attempt_count', o.attempt_count,
           'completed_at', o.completed_at,
           'failure_reason', o.failure_reason,
           'attempts', (SELECT coalesce(json_agg(json_build_object(
                                   'attempt_number', t.attempt_number,
                                   'worker_id', t.worker_id,
                                   'started_at', t.started_at,
                                   'finished_at', t.finished_at,
                                   'outcome', t.outcome,
                                   'diagnostic', t.diagnostic) ORDER BY t.attempt_number), '[]'::json)
                          FROM public.scheduled_work_attempts t WHERE t.occurrence_id = o.id)
       )::text
  FROM public.scheduled_work_occurrences o
 WHERE o.handler_key = 'financials.billing_period_close.evaluate'

UNION ALL

-- q3  was there anything to close, and did anything close?
SELECT 'q3', 'row',
       json_build_object(
           'periods_total', count(*),
           'open', count(*) FILTER (WHERE bp.status = 'open'),
           'closed', count(*) FILTER (WHERE bp.status = 'closed'),
           'closed_by_system', count(*) FILTER (WHERE bp.close_actor = 'system'),
           'closed_by_operator', count(*) FILTER (WHERE bp.close_actor = 'operator'),
           -- the eligibility question, answered in the database's own timezone-free date terms
           'open_and_elapsed', count(*) FILTER (WHERE bp.status = 'open' AND bp.ends_on < current_date),
           'earliest_open_ends_on', min(bp.ends_on) FILTER (WHERE bp.status = 'open'),
           'today', current_date
       )::text
  FROM public.financial_billing_periods bp

UNION ALL

-- q4  and the clock itself, so a silent chain can be told from a stopped clock
SELECT 'q4', 'row',
       json_build_object(
           'last_wake_at', k.last_wake_at,
           'wake_count', k.wake_count,
           'last_worker_id', k.last_worker_id,
           'seconds_since_last_wake', round(extract(epoch FROM (now() - k.last_wake_at)))
       )::text
  FROM public.scheduled_work_clock k

ORDER BY 1
