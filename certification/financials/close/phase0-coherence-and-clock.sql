-- PHASE 0 + PHASE 3 — IS THE REDUCTION REPAIR LIVE, AND IS THE CLOCK ALIVE?
--
-- Two preconditions for commercial close, both answered from the deployed estate rather than from
-- staging HEAD or from a test.
--
-- PHASE 0. The #1398 repair makes one new reduction event carry ONE commercial-period answer: the
-- application row takes its binding from the contra charge, which the S2 binder resolved from the
-- reduction's own economic date. The write itself cannot be exercised here (the session's
-- transaction guard), so the proof is structural plus historical:
--   * the shape CHECKs make the agreement enforceable rather than conventional;
--   * the EXISTING rows are measured for coherence, which shows the pre-repair population and
--     gives a baseline any post-repair row can be compared against.
-- An important non-claim: historical disagreement is NOT a defect to repair. Those rows are legacy
-- history and S2 deliberately left them key-based.
--
-- PHASE 3. The five-minute scheduled-work clock was proven live in an earlier slice. This only
-- reconfirms liveness cheaply — recent wake, worker identity, an occurrence/attempt chain — because
-- automatic close will ride this runtime and nothing else.
--
-- READ-ONLY.
--
-- q1  the shape constraints that make three-column agreement enforceable
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'table', rel.relname,
           'constraint', con.conname,
           'definition', pg_get_constraintdef(con.oid)
       )::text AS payload
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
 WHERE ns.nspname = 'public' AND con.contype = 'c'
   AND rel.relname IN ('charges', 'financial_reduction_applications')
   AND con.conname LIKE '%billing_period%'

UNION ALL

-- q2  COHERENCE of every existing application against the contra charge it explains
SELECT 'q2', 'row',
       json_build_object(
           'applications_total', count(*),
           'generation_agrees', count(*) FILTER (WHERE a.billing_period_generation = c.billing_period_generation),
           'period_id_agrees', count(*) FILTER (WHERE a.billing_period_id IS NOT DISTINCT FROM c.billing_period_id),
           'legacy_key_agrees', count(*) FILTER (WHERE a.legacy_billing_period_key IS NOT DISTINCT FROM c.legacy_billing_period_key),
           'fully_coherent', count(*) FILTER (
               WHERE a.billing_period_generation = c.billing_period_generation
                 AND a.billing_period_id IS NOT DISTINCT FROM c.billing_period_id
                 AND a.legacy_billing_period_key IS NOT DISTINCT FROM c.legacy_billing_period_key),
           'app_generations', (SELECT coalesce(json_agg(json_build_object('gen', g.gen, 'n', g.n) ORDER BY g.gen), '[]'::json)
                                 FROM (SELECT a2.billing_period_generation AS gen, count(*) AS n
                                         FROM public.financial_reduction_applications a2
                                        GROUP BY a2.billing_period_generation) g),
           'newest_application_at', max(a.created_at)
       )::text
  FROM public.financial_reduction_applications a
  JOIN public.charges c ON c.id = a.charge_id

UNION ALL

-- q3  S5 must stay possible: reductions whose period differs from their SOURCE charge's.
--     This is the thing the repair must NOT have collapsed.
SELECT 'q3', 'row',
       json_build_object(
           'applications_with_a_source_charge', count(*),
           'period_differs_from_source', count(*) FILTER (
               WHERE a.legacy_billing_period_key IS DISTINCT FROM src.legacy_billing_period_key
                  OR a.billing_period_id IS DISTINCT FROM src.billing_period_id),
           'cross_period_examples', (
               SELECT coalesce(json_agg(json_build_object(
                          'application_period_key', a2.legacy_billing_period_key,
                          'source_period_key', s2.legacy_billing_period_key)), '[]'::json)
                 FROM public.financial_reduction_applications a2
                 JOIN public.charges s2 ON s2.id = a2.source_charge_id
                WHERE a2.legacy_billing_period_key IS DISTINCT FROM s2.legacy_billing_period_key
                LIMIT 5)
       )::text
  FROM public.financial_reduction_applications a
  JOIN public.charges src ON src.id = a.source_charge_id

UNION ALL

-- q4  PHASE 3 — the clock's own heartbeat
SELECT 'q4', 'row',
       json_build_object(
           'first_wake_at', k.first_wake_at,
           'last_wake_at', k.last_wake_at,
           'wake_count', k.wake_count,
           'last_worker_id', k.last_worker_id,
           'seconds_since_last_wake', round(extract(epoch FROM (now() - k.last_wake_at)))
       )::text
  FROM public.scheduled_work_clock k

UNION ALL

-- q5  PHASE 3 — the registered work, and whether each is due or overdue
SELECT 'q5', 'row',
       json_build_object(
           'scheduled_work_id', w.id,
           'handler_key', w.handler_key,
           'recurrence_kind', w.recurrence_kind,
           'interval_seconds', w.interval_seconds,
           'is_active', w.is_active,
           'next_due_at', w.next_due_at,
           'seconds_until_due', round(extract(epoch FROM (w.next_due_at - now()))),
           'occurrences', (SELECT count(*) FROM public.scheduled_work_occurrences o
                            WHERE o.scheduled_work_id = w.id),
           'occurrences_by_status', (SELECT coalesce(json_agg(json_build_object('status', s.status, 'n', s.n)
                                                              ORDER BY s.status), '[]'::json)
                                       FROM (SELECT o2.status, count(*) AS n
                                               FROM public.scheduled_work_occurrences o2
                                              WHERE o2.scheduled_work_id = w.id
                                              GROUP BY o2.status) s),
           'latest_completed_at', (SELECT max(o3.completed_at) FROM public.scheduled_work_occurrences o3
                                    WHERE o3.scheduled_work_id = w.id)
       )::text
  FROM public.scheduled_work w

UNION ALL

-- q6  PHASE 3 — the newest occurrence/attempt chain, which is what "live" actually means:
--     a real worker claimed a real occurrence and recorded an outcome
SELECT 'q6', 'row',
       json_build_object(
           'occurrence_id', o.id,
           'handler_key', o.handler_key,
           'due_at', o.due_at,
           'status', o.status,
           'claimed_by', o.claimed_by,
           'attempt_count', o.attempt_count,
           'completed_at', o.completed_at,
           'failure_reason', o.failure_reason,
           'attempts', (SELECT coalesce(json_agg(json_build_object(
                                   'attempt_number', t.attempt_number,
                                   'worker_id', t.worker_id,
                                   'started_at', t.started_at,
                                   'finished_at', t.finished_at,
                                   'outcome', t.outcome) ORDER BY t.attempt_number), '[]'::json)
                          FROM public.scheduled_work_attempts t WHERE t.occurrence_id = o.id)
       )::text
  FROM public.scheduled_work_occurrences o
 WHERE o.id IN (SELECT o2.id FROM public.scheduled_work_occurrences o2
                 ORDER BY o2.due_at DESC LIMIT 6)

ORDER BY 1
