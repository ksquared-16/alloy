-- §12 EMPTY-PERIOD CONTROL, at collection time.
--
-- The pre-staged collection artifact (phase3) carries no emptiness question — my own staging gap.
-- §12 asks whether the certification period REMAINED empty through the wait, and whether any
-- unrelated actor touched the synthetic fixture in a way that could compromise attribution. The
-- earlier phase2 census measured emptiness on 2026-10-03, before the wait; this measures it after
-- the close, which is the thing §12 actually asks about.
--
-- Attribution does not DEPEND on emptiness — the closing attempt's own diagnostic names the period
-- it closed (`closed_count: 1`, `closed: [59f50689…]`), so the cause is recorded regardless. This
-- is a control, not the proof.
--
-- READ-ONLY.
--
-- q1  the two certification periods: did any economics land in them?
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'billing_period_id', bp.id,
           'period_key', bp.period_key,
           'status', bp.status,
           'charges_in_period', (SELECT count(*) FROM public.charges c
                                  WHERE c.billing_period_id = bp.id),
           'reductions_in_period', (SELECT count(*) FROM public.financial_reduction_applications r
                                     WHERE r.billing_period_id = bp.id),
           'is_empty', (NOT EXISTS (SELECT 1 FROM public.charges c2 WHERE c2.billing_period_id = bp.id)
                        AND NOT EXISTS (SELECT 1 FROM public.financial_reduction_applications r2
                                         WHERE r2.billing_period_id = bp.id))
       )::text AS payload
  FROM public.financial_billing_periods bp
 WHERE bp.id::text IN ('59f50689-030f-4c91-a38e-57a3a62b6279',
                       'd93a6a6f-2ea3-45ed-b878-b5549c518772')

UNION ALL

-- q2  the whole synthetic fixture: has anything economic appeared on this household at all?
SELECT 'q2', 'row',
       json_build_object(
           'customer_id', 'fd000000-0000-4000-8000-0000000c0003',
           'charges_any', (SELECT count(*) FROM public.charges ch
                            JOIN public.child_enrollment_agreements a ON a.id = ch.billable_source_id
                            LEFT JOIN public.customer_members cm ON cm.id = a.customer_member_id
                           WHERE ch.billable_source_type = 'enrollment_agreement'
                             AND coalesce(a.customer_id, cm.customer_id)::text
                                 = 'fd000000-0000-4000-8000-0000000c0003'),
           'payments_any', (SELECT count(*) FROM public.payments p
                             WHERE p.customer_id::text = 'fd000000-0000-4000-8000-0000000c0003'),
           'reductions_any', (SELECT count(*) FROM public.financial_reduction_applications r
                               WHERE r.customer_id::text = 'fd000000-0000-4000-8000-0000000c0003'),
           'obligations_any', (SELECT count(*) FROM public.resolved_obligations o
                                JOIN public.charges ch2 ON ch2.id = o.draft_charge_id
                                JOIN public.child_enrollment_agreements a2 ON a2.id = ch2.billable_source_id
                                LEFT JOIN public.customer_members cm2 ON cm2.id = a2.customer_member_id
                               WHERE coalesce(a2.customer_id, cm2.customer_id)::text
                                     = 'fd000000-0000-4000-8000-0000000c0003'),
           'periods_total', (SELECT count(*) FROM public.financial_billing_periods bp2
                              WHERE bp2.customer_id::text = 'fd000000-0000-4000-8000-0000000c0003')
       )::text

ORDER BY 1
