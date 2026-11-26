-- WHICH PRODUCT PATHS CAN A 50b19065-SHAPED HOUSEHOLD REACH, AND WITH WHAT AGREEMENT IDS?
--
-- §8 reports that the unresolved multi-location condition surfaces as HTTP 500 / INTERNAL on at
-- least one path. Confirming or correcting that needs the household's real agreement ids, because
-- the refusal happens inside `resolveChargeBillingPeriodBinding` and is only reachable through a
-- path that names a real agreement. A placeholder id fails validation first and proves nothing.
--
-- READ-ONLY.
--
-- q1  the agreements of the customer the Director left deliberately unconfigured
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'customer_id', coalesce(a.customer_id, cm.customer_id),
           'agreement_id', a.id,
           'status', a.status,
           'site_location_id', a.site_location_id,
           'customer_member_id', a.customer_member_id,
           'person_id', a.person_id,
           'location_calendar_cadence', (
               SELECT p.value ->> 'cadence' FROM public.financial_policies p
                WHERE p.policy_type = 'billing_calendar' AND p.scope_type = 'location'
                  AND p.location_id = a.site_location_id AND p.is_active
                ORDER BY p.created_at DESC LIMIT 1),
           'has_customer_calendar', EXISTS (
               SELECT 1 FROM public.financial_policies p
                WHERE p.policy_type = 'billing_calendar' AND p.scope_type = 'customer'
                  AND p.customer_id = coalesce(a.customer_id, cm.customer_id) AND p.is_active)
       )::text AS payload
  FROM public.child_enrollment_agreements a
  LEFT JOIN public.customer_members cm ON cm.id = a.customer_member_id
 WHERE coalesce(a.customer_id, cm.customer_id)::text = '50b19065-51fd-41e4-83c9-07ba787759f0'

UNION ALL

-- q2  and the state that must stay true for this customer: period-bound creation REFUSES, so it
--     should carry no canonical period and no canonical-generation economics at all
SELECT 'q2', 'row',
       json_build_object(
           'canonical_periods', (SELECT count(*) FROM public.financial_billing_periods bp
                                  WHERE bp.customer_id::text = '50b19065-51fd-41e4-83c9-07ba787759f0'),
           'customer_calendars', (SELECT count(*) FROM public.financial_policies p
                                   WHERE p.policy_type = 'billing_calendar' AND p.scope_type = 'customer'
                                     AND p.customer_id::text = '50b19065-51fd-41e4-83c9-07ba787759f0'),
           'charges', (SELECT count(*) FROM public.charges ch
                        JOIN public.child_enrollment_agreements a2 ON a2.id = ch.billable_source_id
                        LEFT JOIN public.customer_members cm2 ON cm2.id = a2.customer_member_id
                       WHERE ch.billable_source_type = 'enrollment_agreement'
                         AND coalesce(a2.customer_id, cm2.customer_id)::text = '50b19065-51fd-41e4-83c9-07ba787759f0'),
           'reductions', (SELECT count(*) FROM public.financial_reduction_applications r
                           WHERE r.customer_id::text = '50b19065-51fd-41e4-83c9-07ba787759f0')
       )::text

ORDER BY 1
