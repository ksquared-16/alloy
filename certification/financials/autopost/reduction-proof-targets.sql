-- §11 — CHOOSING SAFE SUBJECTS FOR THE REDUCTIONCORE DEPLOYED PROOF
--
-- The repair has to be proven by a real write through the shared reduction authority on deployed,
-- not by a test. That means picking subjects first, and picking them so the proof is controlled:
-- an active agreement whose customer's commercial calendar already resolves, and a posted charge
-- that is still standing. A subject whose calendar is ambiguous would refuse for a reason that has
-- nothing to do with this repair and would prove nothing either way.
--
-- READ-ONLY.
--
-- q1  candidate agreements: active, customer resolvable, calendar resolvable, not multi-location
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'enrollment_agreement_id', ag.id,
           'org_id', ag.org_id,
           'customer_id', coalesce(ag.customer_id, cm.customer_id),
           'customer_member_id', ag.customer_member_id,
           'site_location_id', ag.site_location_id,
           'status', ag.status,
           'location_count_for_customer', (
               SELECT count(DISTINCT a2.site_location_id)
                 FROM public.child_enrollment_agreements a2
                 LEFT JOIN public.customer_members cm2 ON cm2.id = a2.customer_member_id
                WHERE coalesce(a2.customer_id, cm2.customer_id) = coalesce(ag.customer_id, cm.customer_id)
                  AND a2.status = ANY (ARRAY['pending_start', 'active', 'ending'])),
           'has_customer_calendar', EXISTS (
               SELECT 1 FROM public.financial_policies p
                WHERE p.policy_type = 'billing_calendar' AND p.scope_type = 'customer'
                  AND p.customer_id = coalesce(ag.customer_id, cm.customer_id) AND p.is_active),
           'location_calendar_cadence', (
               SELECT p.value ->> 'cadence' FROM public.financial_policies p
                WHERE p.policy_type = 'billing_calendar' AND p.scope_type = 'location'
                  AND p.location_id = ag.site_location_id AND p.is_active
                ORDER BY p.created_at DESC LIMIT 1),
           'standing_posted_charges', (
               SELECT count(*) FROM public.charges c
                WHERE c.billable_source_type = 'enrollment_agreement'
                  AND c.billable_source_id = ag.id
                  AND c.status = 'posted' AND c.voided_at IS NULL
                  AND c.source_charge_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM public.charges rev
                                   WHERE rev.source_charge_id = c.id AND rev.status <> 'void')),
           'existing_reductions', (
               SELECT count(*) FROM public.financial_reduction_applications a
                WHERE a.enrollment_agreement_id = ag.id)
       )::text AS payload
  FROM public.child_enrollment_agreements ag
  LEFT JOIN public.customer_members cm ON cm.id = ag.customer_member_id
 WHERE ag.status = 'active'
   AND coalesce(ag.customer_id, cm.customer_id) IS NOT NULL

UNION ALL

-- q2  the standing posted childcare charges a correction could legitimately be recorded against:
--     not already a correction, not voided, not already reversed. One of these is the policy /
--     waiver subject; its period membership is what the proof checks the new row against.
SELECT 'q2', 'row',
       json_build_object(
           'charge_id', c.id,
           'org_id', c.org_id,
           'enrollment_agreement_id', c.billable_source_id,
           'charge_type', c.charge_type,
           'charge_category', c.charge_category,
           'amount_cents', c.amount_cents,
           'service_date', c.service_date,
           'billable_on', c.billable_on,
           'generation', c.billing_period_generation,
           'legacy_period_key', c.legacy_billing_period_key,
           'billing_period_id', c.billing_period_id,
           'service_id', c.service_id
       )::text
  FROM public.charges c
 WHERE c.billable_source_type = 'enrollment_agreement'
   AND c.status = 'posted' AND c.voided_at IS NULL
   AND c.source_charge_id IS NULL
   AND c.amount_cents > 0
   AND NOT EXISTS (SELECT 1 FROM public.charges rev
                    WHERE rev.source_charge_id = c.id AND rev.status <> 'void')
   AND c.id IN (SELECT c2.id FROM public.charges c2
                 WHERE c2.billable_source_type = 'enrollment_agreement'
                   AND c2.status = 'posted' AND c2.voided_at IS NULL
                   AND c2.source_charge_id IS NULL AND c2.amount_cents > 0
                 ORDER BY c2.billable_on DESC NULLS LAST, c2.id
                 LIMIT 12)

UNION ALL

-- q3  what commercial policies exist to drive the POLICY reduction path, rather than inventing one
SELECT 'q3', 'row',
       json_build_object(
           'policy_id', p.id,
           'org_id', p.org_id,
           'policy_type', p.policy_type,
           'scope_type', p.scope_type,
           'is_active', p.is_active,
           'value_keys', (SELECT coalesce(json_agg(k ORDER BY k), '[]'::json)
                            FROM jsonb_object_keys(p.value::jsonb) k)
       )::text
  FROM public.financial_policies p
 WHERE p.is_active
   AND p.policy_type <> 'billing_calendar'
   AND p.id IN (SELECT p2.id FROM public.financial_policies p2
                 WHERE p2.is_active AND p2.policy_type <> 'billing_calendar'
                 ORDER BY p2.policy_type, p2.scope_type, p2.id
                 LIMIT 40)

UNION ALL

-- q4  the open canonical periods, so the proof can say which membership it expected and why
SELECT 'q4', 'row',
       json_build_object(
           'billing_period_id', bp.id,
           'customer_id', bp.customer_id,
           'period_key', bp.period_key,
           'starts_on', bp.starts_on,
           'ends_on', bp.ends_on,
           'status', bp.status,
           'cadence', bp.cadence,
           'calendar_scope', bp.calendar_scope
       )::text
  FROM public.financial_billing_periods bp

ORDER BY 1
