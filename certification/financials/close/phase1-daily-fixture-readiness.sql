-- TERMINAL S3/S4 — IS THERE ALREADY A DAILY-CADENCE SYNTHETIC HOUSEHOLD TO CERTIFY AGAINST?
--
-- The terminal proof needs a canonical period whose commercial boundary arrives within a day, so the
-- real clock can close it naturally. An earlier census found a synthetic household already carrying
-- an explicit DAILY customer calendar with zero economics. If that is still true, this certification
-- needs no new customer, no new calendar and no migration — only a materialization through the S1
-- door, which is the narrowest possible footprint on the deployed estate.
--
-- This also records the clock and close-schedule health that §1 and §14 require, so a later "it did
-- not close" can be told apart from "the scheduler stopped".
--
-- READ-ONLY.
--
-- q1  every household with an explicit customer billing calendar, and what it carries
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'customer_id', p.customer_id,
           'cadence', p.value ->> 'cadence',
           'anchor_on', p.value ->> 'anchor_on',
           'policy_id', p.id,
           'is_active', p.is_active,
           'effective_start', p.effective_start,
           'effective_end', p.effective_end,
           -- what is at risk if this household is used
           'charges', (SELECT count(*) FROM public.charges ch
                        JOIN public.child_enrollment_agreements a ON a.id = ch.billable_source_id
                        LEFT JOIN public.customer_members cm ON cm.id = a.customer_member_id
                       WHERE ch.billable_source_type = 'enrollment_agreement'
                         AND coalesce(a.customer_id, cm.customer_id) = p.customer_id),
           'payments', (SELECT count(*) FROM public.payments pay WHERE pay.customer_id = p.customer_id),
           'reductions', (SELECT count(*) FROM public.financial_reduction_applications r
                           WHERE r.customer_id = p.customer_id),
           'active_agreements', (SELECT count(*) FROM public.child_enrollment_agreements a2
                                  LEFT JOIN public.customer_members cm2 ON cm2.id = a2.customer_member_id
                                 WHERE coalesce(a2.customer_id, cm2.customer_id) = p.customer_id
                                   AND a2.status = 'active'),
           'locations_live', (SELECT count(DISTINCT a3.site_location_id)
                                FROM public.child_enrollment_agreements a3
                                LEFT JOIN public.customer_members cm3 ON cm3.id = a3.customer_member_id
                               WHERE coalesce(a3.customer_id, cm3.customer_id) = p.customer_id
                                 AND a3.status = ANY (ARRAY['pending_start', 'active', 'ending'])),
           'id_is_structured_fixture', (p.customer_id::text LIKE '00000000-%'
                                        OR p.customer_id::text LIKE 'fd000000-%'
                                        OR p.customer_id::text LIKE '8c000000-%'),
           'existing_periods', (SELECT coalesce(json_agg(json_build_object(
                                           'period_key', bp.period_key, 'cadence', bp.cadence,
                                           'starts_on', bp.starts_on, 'ends_on', bp.ends_on,
                                           'status', bp.status) ORDER BY bp.starts_on), '[]'::json)
                                  FROM public.financial_billing_periods bp
                                 WHERE bp.customer_id = p.customer_id)
       )::text AS payload
  FROM public.financial_policies p
 WHERE p.policy_type = 'billing_calendar' AND p.scope_type = 'customer' AND p.is_active

UNION ALL

-- q2  §1 + §14 — the close schedule and the clock, cheaply
SELECT 'q2', 'row',
       json_build_object(
           'close_schedules', (SELECT coalesce(json_agg(json_build_object(
                                       'scheduled_work_id', w.id, 'org_id', w.org_id,
                                       'recurrence_kind', w.recurrence_kind, 'is_active', w.is_active,
                                       'next_due_at', w.next_due_at,
                                       'seconds_until_due', round(extract(epoch FROM (w.next_due_at - now()))))), '[]'::json)
                                 FROM public.scheduled_work w
                                WHERE w.handler_key = 'financials.billing_period_close.evaluate'),
           'close_occurrences', (SELECT count(*) FROM public.scheduled_work_occurrences o
                                  WHERE o.handler_key = 'financials.billing_period_close.evaluate'),
           'clock_last_wake_at', (SELECT k.last_wake_at FROM public.scheduled_work_clock k LIMIT 1),
           'clock_wake_count', (SELECT k.wake_count FROM public.scheduled_work_clock k LIMIT 1),
           'clock_last_worker', (SELECT k.last_worker_id FROM public.scheduled_work_clock k LIMIT 1),
           'clock_seconds_since_wake', (SELECT round(extract(epoch FROM (now() - k.last_wake_at)))
                                          FROM public.scheduled_work_clock k LIMIT 1),
           'db_now', now(),
           'db_current_date', current_date
       )::text

UNION ALL

-- q3  the org's canonical business timezone, because eligibility is a DATE in that zone and must be
--     read from deployed authority rather than computed from the model's own clock
SELECT 'q3', 'row',
       json_build_object(
           'org_id', o.id,
           'time_zone_columns', (SELECT coalesce(json_agg(c.column_name ORDER BY c.column_name), '[]'::json)
                                   FROM information_schema.columns c
                                  WHERE c.table_schema = 'public' AND c.table_name = 'orgs'
                                    AND (c.column_name ILIKE '%zone%' OR c.column_name ILIKE '%tz%'))
       )::text
  FROM public.orgs o
 WHERE EXISTS (SELECT 1 FROM public.financial_billing_periods bp WHERE bp.org_id = o.id)

ORDER BY 1
