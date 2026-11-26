-- IS THE CHOSEN SYNTHETIC HOUSEHOLD FREE OF CERTIFICATION HISTORY, AND CAN IT GENERATE TUITION?
--
-- Two questions, both of which must be answered before anything is written on deployed.
--
-- (1) SAFETY. The provenance census named three zero-economics synthetic households, but they share
--     a seeded id family with one household whose NAME matches the reserved fixture list. Siblings
--     of a reserved fixture are not automatically reserved — and they are not automatically safe
--     either. So this asks directly: is any of them referenced by QA acceptance evidence, by a
--     work item, or by anything else that would make writing to it destroy testimony?
--
-- (2) READINESS. §3 needs an ordinary generated charge with complete economics, a canonical customer
--     billing calendar, no posting_review policy and no unresolved prerequisite. For tuition that
--     means an ACCEPTED pricing term and a schedule. This asks whether the candidate already has
--     them, because a fixture that cannot generate is not a proof vehicle.
--
-- READ-ONLY. No names are returned.
--
-- q1  QA-evidence implication for the three candidates
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'customer_id', c.id,
           'qa_acceptance_rows_mentioning_id', (
               SELECT count(*) FROM public.qa_director_acceptance_results r
                WHERE r.observation ILIKE '%' || c.id::text || '%'),
           'payments', (SELECT count(*) FROM public.payments p WHERE p.customer_id = c.id),
           'charges_any', (SELECT count(*) FROM public.charges ch
                            JOIN public.child_enrollment_agreements a ON a.id = ch.billable_source_id
                            LEFT JOIN public.customer_members cm ON cm.id = a.customer_member_id
                           WHERE ch.billable_source_type = 'enrollment_agreement'
                             AND coalesce(a.customer_id, cm.customer_id) = c.id),
           'reductions_any', (SELECT count(*) FROM public.financial_reduction_applications r
                               WHERE r.customer_id = c.id),
           'obligations_any', (SELECT count(*) FROM public.resolved_obligations o
                                JOIN public.charges ch ON ch.id = o.draft_charge_id
                                JOIN public.child_enrollment_agreements a ON a.id = ch.billable_source_id
                                LEFT JOIN public.customer_members cm ON cm.id = a.customer_member_id
                               WHERE coalesce(a.customer_id, cm.customer_id) = c.id)
       )::text AS payload
  FROM public.customers c
 WHERE c.id::text IN ('fd000000-0000-4000-8000-0000000c0002',
                      'fd000000-0000-4000-8000-0000000c0003',
                      'fd000000-0000-4000-8000-0000000c0004')

UNION ALL

-- q2  generation readiness per candidate: calendar, agreement, accepted term, schedule
SELECT 'q2', 'row',
       json_build_object(
           'customer_id', coalesce(a.customer_id, cm.customer_id),
           'agreement_id', a.id,
           'agreement_status', a.status,
           'start_date', a.start_date,
           'end_date', a.end_date,
           'site_location_id', a.site_location_id,
           'person_id', a.person_id,
           'customer_calendar_cadence', (
               SELECT p.value ->> 'cadence' FROM public.financial_policies p
                WHERE p.policy_type = 'billing_calendar' AND p.scope_type = 'customer'
                  AND p.customer_id = coalesce(a.customer_id, cm.customer_id) AND p.is_active
                ORDER BY p.created_at DESC LIMIT 1),
           'location_calendar_cadence', (
               SELECT p.value ->> 'cadence' FROM public.financial_policies p
                WHERE p.policy_type = 'billing_calendar' AND p.scope_type = 'location'
                  AND p.location_id = a.site_location_id AND p.is_active
                ORDER BY p.created_at DESC LIMIT 1),
           'accepted_pricing_terms', (
               SELECT coalesce(json_agg(json_build_object('id', t.id, 'state', t.state,
                                                          'term_kind', t.term_kind,
                                                          'cadence_key', t.cadence_key,
                                                          'amount_cents', t.amount_cents,
                                                          'effective_start', t.effective_start,
                                                          'effective_end', t.effective_end)), '[]'::json)
                 FROM public.enrollment_pricing_terms t
                WHERE t.enrollment_agreement_id = a.id AND t.state = 'accepted'),
           'all_pricing_term_states', (
               SELECT coalesce(json_agg(DISTINCT t2.state), '[]'::json)
                 FROM public.enrollment_pricing_terms t2
                WHERE t2.enrollment_agreement_id = a.id),
           'canonical_periods', (
               SELECT coalesce(json_agg(json_build_object('period_key', bp.period_key,
                                                          'status', bp.status,
                                                          'cadence', bp.cadence)
                                        ORDER BY bp.starts_on), '[]'::json)
                 FROM public.financial_billing_periods bp
                WHERE bp.customer_id = coalesce(a.customer_id, cm.customer_id))
       )::text
  FROM public.child_enrollment_agreements a
  LEFT JOIN public.customer_members cm ON cm.id = a.customer_member_id
 WHERE coalesce(a.customer_id, cm.customer_id)::text IN ('fd000000-0000-4000-8000-0000000c0002',
                                                         'fd000000-0000-4000-8000-0000000c0003',
                                                         'fd000000-0000-4000-8000-0000000c0004')

UNION ALL

-- q3  estate-wide: is there ANY posting_review policy that could make a generated charge a
--     deliberate draft, and what does the review policy vocabulary actually look like?
SELECT 'q3', 'row',
       json_build_object(
           'policy_types_active', (SELECT coalesce(json_agg(DISTINCT p.policy_type), '[]'::json)
                                     FROM public.financial_policies p WHERE p.is_active),
           'posting_review_like', (SELECT count(*) FROM public.financial_policies p
                                    WHERE p.is_active
                                      AND (p.policy_type ILIKE '%review%' OR p.policy_type ILIKE '%posting%'))
       )::text

ORDER BY 1
