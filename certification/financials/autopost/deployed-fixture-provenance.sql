-- WHICH DEPLOYED HOUSEHOLDS ARE DISPOSABLE SYNTHETIC FIXTURES?
--
-- The deployed write proofs are authorized on CONTROLLED SYNTHETIC fixtures only, and explicitly
-- NOT on Certhouse, Certopp, Alvarez, Kelly's W7 fixtures, or any household carrying certification
-- history that must be preserved. Choosing one therefore needs provenance, not a guess from a uuid.
--
-- This deliberately does NOT return household names. It returns provenance markers and boolean
-- flags against the forbidden list, so the answer is recordable without putting customer-like
-- identifying text into a certification artifact.
--
-- READ-ONLY.
--
-- q1  every household with an active agreement, classified by provenance and by what it carries
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'customer_id', c.id,
           'external_source', coalesce(c.external_source, '(null)'),
           'customer_type', coalesce(c.customer_type, '(null)'),
           'status_key', coalesce(c.status_key, '(null)'),
           'metadata_keys', (SELECT coalesce(json_agg(k ORDER BY k), '[]'::json)
                               FROM jsonb_object_keys(coalesce(c.metadata, '{}')::jsonb) k),
           -- forbidden-list match, as a flag rather than as the name itself
           'name_matches_reserved_fixture', (
               c.name ILIKE '%certhouse%' OR c.name ILIKE '%certopp%' OR c.name ILIKE '%alvarez%'
               OR c.name ILIKE '%kelly%' OR c.name ILIKE '%w7%'),
           'name_looks_synthetic', (
               c.name ILIKE '%test%' OR c.name ILIKE '%fixture%' OR c.name ILIKE '%synthetic%'
               OR c.name ILIKE '%sample%' OR c.name ILIKE '%demo%' OR c.name ILIKE '%proof%'),
           'id_prefix', left(c.id::text, 8),
           'id_is_structured_fixture', (c.id::text LIKE '00000000-0000-4000-8000-%'
                                        OR c.id::text LIKE 'fd000000-%' OR c.id::text LIKE '8c000000-%'),
           -- what it carries, i.e. what would be at risk
           'charges_total', (SELECT count(*) FROM public.charges ch
                              JOIN public.child_enrollment_agreements a2 ON a2.id = ch.billable_source_id
                              LEFT JOIN public.customer_members cm2 ON cm2.id = a2.customer_member_id
                             WHERE ch.billable_source_type = 'enrollment_agreement'
                               AND coalesce(a2.customer_id, cm2.customer_id) = c.id),
           'draft_charges', (SELECT count(*) FROM public.charges ch
                              JOIN public.child_enrollment_agreements a2 ON a2.id = ch.billable_source_id
                              LEFT JOIN public.customer_members cm2 ON cm2.id = a2.customer_member_id
                             WHERE ch.billable_source_type = 'enrollment_agreement'
                               AND coalesce(a2.customer_id, cm2.customer_id) = c.id
                               AND ch.status = 'draft'),
           'payments', (SELECT count(*) FROM public.payments p WHERE p.customer_id = c.id),
           'reductions', (SELECT count(*) FROM public.financial_reduction_applications r
                           WHERE r.customer_id = c.id),
           'active_agreements', (SELECT count(*) FROM public.child_enrollment_agreements a3
                                  LEFT JOIN public.customer_members cm3 ON cm3.id = a3.customer_member_id
                                 WHERE coalesce(a3.customer_id, cm3.customer_id) = c.id
                                   AND a3.status = 'active'),
           'locations', (SELECT count(DISTINCT a4.site_location_id) FROM public.child_enrollment_agreements a4
                           LEFT JOIN public.customer_members cm4 ON cm4.id = a4.customer_member_id
                          WHERE coalesce(a4.customer_id, cm4.customer_id) = c.id
                            AND a4.status = ANY (ARRAY['pending_start', 'active', 'ending'])),
           'has_customer_calendar', EXISTS (
               SELECT 1 FROM public.financial_policies p
                WHERE p.policy_type = 'billing_calendar' AND p.scope_type = 'customer'
                  AND p.customer_id = c.id AND p.is_active),
           'location_calendar_cadences', (
               SELECT coalesce(json_agg(DISTINCT p.value ->> 'cadence'), '[]'::json)
                 FROM public.financial_policies p
                WHERE p.policy_type = 'billing_calendar' AND p.scope_type = 'location' AND p.is_active
                  AND p.location_id IN (SELECT a5.site_location_id
                                          FROM public.child_enrollment_agreements a5
                                          LEFT JOIN public.customer_members cm5 ON cm5.id = a5.customer_member_id
                                         WHERE coalesce(a5.customer_id, cm5.customer_id) = c.id
                                           AND a5.status = 'active'))
       )::text AS payload
  FROM public.customers c
 WHERE EXISTS (SELECT 1 FROM public.child_enrollment_agreements a
                 LEFT JOIN public.customer_members cm ON cm.id = a.customer_member_id
                WHERE coalesce(a.customer_id, cm.customer_id) = c.id AND a.status = 'active')

UNION ALL

-- q2  can a brand-new synthetic household be created through the product at all? the canonical
--     creation path needs a location that is a SITE, and a tuition term for generated billing.
SELECT 'q2', 'row',
       json_build_object(
           'site_locations', (SELECT count(*) FROM public.locations l
                               WHERE l.location_type = 'site' AND coalesce(l.is_active, true)),
           'site_locations_with_monthly_calendar', (
               SELECT count(DISTINCT l.id) FROM public.locations l
                 JOIN public.financial_policies p ON p.location_id = l.id
                WHERE l.location_type = 'site' AND p.policy_type = 'billing_calendar'
                  AND p.scope_type = 'location' AND p.is_active),
           'financial_charge_templates', (SELECT count(*) FROM public.financial_charge_templates),
           'posting_review_policies', (SELECT count(*) FROM public.financial_policies p
                                        WHERE p.policy_type ILIKE '%review%' AND p.is_active),
           'accepted_pricing_terms', (SELECT count(*) FROM public.enrollment_pricing_terms t
                                       WHERE t.state = 'accepted'),
           -- the clock that would own an unattended continuation
           'scheduled_work_rows', (SELECT count(*) FROM public.scheduled_work),
           'scheduled_work_occurrences', (SELECT count(*) FROM public.scheduled_work_occurrences)
       )::text

ORDER BY 1
