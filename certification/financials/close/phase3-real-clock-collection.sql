-- TERMINAL S3/S4 — COLLECT THE REAL-CLOCK CHAIN. Run at or after 2026-10-04T04:00:00Z.
--
-- Everything this asks about was armed and verified before the wait (see TERMINAL-REAL-CLOCK.md):
--   certification period  59f50689-030f-4c91-a38e-57a3a62b6279   key 2026-10-03~2026-10-03
--   next period           d93a6a6f-2ea3-45ed-b878-b5549c518772   key 2026-10-04~2026-10-04
--   close schedule        2edf2559-d500-4edc-a96c-501c383315de   org 93667019…, daily, 04:00Z
--   fixture customer      fd000000-0000-4000-8000-0000000c0003   daily calendar, zero economics
--
-- The point of collecting rather than asserting: §8 wants the unattended chain reconstructed from
-- DURABLE evidence with exact identifiers, not inferred from a UI or from the handler's source.
--
-- READ-ONLY. This census closes nothing and touches nothing.
--
-- q1  THE TRANSITION, and its attribution
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'billing_period_id', bp.id,
           'period_key', bp.period_key,
           'customer_id', bp.customer_id,
           'org_id', bp.org_id,
           'cadence', bp.cadence,
           -- §10: the bounds and snapshot must be the ones materialized BEFORE the wait
           'starts_on', bp.starts_on,
           'ends_on', bp.ends_on,
           'anchor_on', bp.anchor_on,
           'calendar_scope', bp.calendar_scope,
           'calendar_policy_id', bp.calendar_policy_id,
           'calendar_snapshot', bp.calendar_snapshot,
           -- §9: the attribution
           'status', bp.status,
           'closed_at', bp.closed_at,
           'close_actor', bp.close_actor,
           'closed_by', bp.closed_by,
           'closed_by_is_null', (bp.closed_by IS NULL),
           'updated_at', bp.updated_at,
           'db_now', now(),
           'db_current_date', current_date
       )::text AS payload
  FROM public.financial_billing_periods bp
 WHERE bp.id::text IN ('59f50689-030f-4c91-a38e-57a3a62b6279',
                       'd93a6a6f-2ea3-45ed-b878-b5549c518772')

UNION ALL

-- q2  §8 — the durable chain: schedule -> occurrence -> claim/lease -> attempt -> outcome
SELECT 'q2', 'row',
       json_build_object(
           'occurrence_id', o.id,
           'scheduled_work_id', o.scheduled_work_id,
           'handler_key', o.handler_key,
           'org_id', o.org_id,
           'due_at', o.due_at,
           'status', o.status,
           'claimed_by', o.claimed_by,
           'claim_token_present', (o.claim_token IS NOT NULL),
           'lease_expires_at', o.lease_expires_at,
           'attempt_count', o.attempt_count,
           'completed_at', o.completed_at,
           'failure_reason', o.failure_reason,
           'created_at', o.created_at,
           'attempts', (SELECT coalesce(json_agg(json_build_object(
                                   'attempt_id', t.id,
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

-- q3  §12 EXACTLY ONCE — one transition, and the schedule's own forward state
SELECT 'q3', 'row',
       json_build_object(
           'close_occurrences_total', (SELECT count(*) FROM public.scheduled_work_occurrences o2
                                        WHERE o2.handler_key = 'financials.billing_period_close.evaluate'),
           'close_attempts_total', (SELECT count(*) FROM public.scheduled_work_attempts t2
                                     WHERE t2.handler_key = 'financials.billing_period_close.evaluate'),
           -- how many periods this org now has closed by the SYSTEM, and by an operator
           'closed_by_system', (SELECT count(*) FROM public.financial_billing_periods b2
                                 WHERE b2.close_actor = 'system'),
           'closed_by_operator', (SELECT count(*) FROM public.financial_billing_periods b3
                                   WHERE b3.close_actor = 'operator'),
           'schedule_next_due_at', (SELECT w.next_due_at FROM public.scheduled_work w
                                     WHERE w.id::text = '2edf2559-d500-4edc-a96c-501c383315de'),
           'schedule_is_active', (SELECT w.is_active FROM public.scheduled_work w
                                   WHERE w.id::text = '2edf2559-d500-4edc-a96c-501c383315de')
       )::text

UNION ALL

-- q4  §11 CONTINUITY — the customer's whole period ladder: no overlap, no gap
SELECT 'q4', 'row',
       json_build_object(
           'period_key', bp.period_key,
           'starts_on', bp.starts_on,
           'ends_on', bp.ends_on,
           'status', bp.status,
           'close_actor', bp.close_actor,
           'days_in_period', (bp.ends_on - bp.starts_on + 1),
           'gap_days_before_next', (
               SELECT (nxt.starts_on - bp.ends_on - 1)
                 FROM public.financial_billing_periods nxt
                WHERE nxt.customer_id = bp.customer_id AND nxt.starts_on > bp.ends_on
                ORDER BY nxt.starts_on LIMIT 1)
       )::text
  FROM public.financial_billing_periods bp
 WHERE bp.customer_id::text = 'fd000000-0000-4000-8000-0000000c0003'

UNION ALL

-- q5  §14 CLOCK HEALTH CONTROL — so "did not close" can be told from "scheduler stopped"
SELECT 'q5', 'row',
       json_build_object(
           'clock_last_wake_at', k.last_wake_at,
           'clock_wake_count', k.wake_count,
           'clock_last_worker_id', k.last_worker_id,
           'seconds_since_last_wake', round(extract(epoch FROM (now() - k.last_wake_at))),
           -- other handlers waking proves the runtime as a whole is alive
           'recent_occurrences_any_handler', (
               SELECT coalesce(json_agg(json_build_object('handler_key', r.handler_key,
                                                          'due_at', r.due_at,
                                                          'status', r.status)), '[]'::json)
                 FROM (SELECT o3.handler_key, o3.due_at, o3.status
                         FROM public.scheduled_work_occurrences o3
                        ORDER BY o3.due_at DESC LIMIT 8) r)
       )::text
  FROM public.scheduled_work_clock k

ORDER BY 1
