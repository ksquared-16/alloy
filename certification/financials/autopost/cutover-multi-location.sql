-- CAN THE THREE EXISTING MULTI-LOCATION CUSTOMERS BE INITIALIZED WITHOUT INVENTING INTENT?
--
-- S2 placed a requirement onto an estate that predates it: a customer attending two locations needs
-- an explicit account calendar, and until it has one, period-bound economics refuse. That is the
-- forward doctrine and it stays. The question here is narrower and purely historical:
--
--   does the evidence ALREADY say what commercial cadence this customer operated under?
--
-- If every historical fact says monthly and nothing says otherwise, initializing the account calendar
-- to monthly at the cutover boundary restates history rather than choosing policy. If anything
-- conflicts, the customer is returned for decision instead.
--
-- Read-only.
--
-- q1  the three customers, their locations, and whether they already carry an account calendar
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'customer_id', t.customer_id,
           'location_count', t.location_count,
           'location_ids', t.location_ids,
           'live_agreements', t.live_agreements,
           'has_explicit_customer_calendar', EXISTS (
               SELECT 1 FROM public.financial_policies p
                WHERE p.policy_type = 'billing_calendar' AND p.scope_type = 'customer'
                  AND p.customer_id = t.customer_id AND p.is_active),
           'location_calendars', (
               SELECT coalesce(json_agg(DISTINCT (p.location_id::text || '=' || (p.value ->> 'cadence'))), '[]'::json)
                 FROM public.financial_policies p
                WHERE p.policy_type = 'billing_calendar' AND p.scope_type = 'location'
                  AND p.location_id::text = ANY (
                      SELECT jsonb_array_elements_text(t.location_ids::jsonb)))
       )::text AS payload
FROM (
    SELECT cm.customer_id,
           count(DISTINCT a.site_location_id) AS location_count,
           json_agg(DISTINCT a.site_location_id) AS location_ids,
           count(*) AS live_agreements
      FROM public.child_enrollment_agreements a
      JOIN public.customer_members cm ON cm.id = a.customer_member_id
     WHERE cm.customer_id IS NOT NULL
       AND a.status = ANY (ARRAY['pending_start'::text, 'active'::text, 'ending'::text])
       AND (a.end_date IS NULL OR a.end_date >= current_date)
     GROUP BY cm.customer_id
    HAVING count(DISTINCT a.site_location_id) > 1
) t

UNION ALL

-- q2  WAS THIS CUSTOMER'S HISTORY MONTHLY? Every legacy charge's frozen key, shaped. A key that is
--     not `YYYY-MM` would be contrary evidence; all-monthly is the deterministic case.
SELECT 'q2', 'row',
       json_build_object(
           'customer_id', h.customer_id,
           'legacy_charges', count(*),
           'distinct_legacy_keys', count(DISTINCT h.legacy_billing_period_key),
           'all_monthly_shaped', bool_and(h.legacy_billing_period_key ~ '^\d{4}-\d{2}$'),
           'non_monthly_keys', count(*) FILTER (WHERE h.legacy_billing_period_key !~ '^\d{4}-\d{2}$'),
           'keys', json_agg(DISTINCT h.legacy_billing_period_key),
           'canonical_charges', count(*) FILTER (WHERE h.billing_period_generation = 'canonical')
       )::text
FROM (
    SELECT CASE WHEN c.billable_source_type = 'customer' THEN c.billable_source_id
                ELSE (SELECT coalesce(a.customer_id, cm.customer_id)
                        FROM public.child_enrollment_agreements a
                        LEFT JOIN public.customer_members cm ON cm.id = a.customer_member_id
                       WHERE a.id = c.billable_source_id) END AS customer_id,
           c.legacy_billing_period_key, c.billing_period_generation
      FROM public.charges c
     WHERE c.billable_source_type = ANY (ARRAY['customer'::text, 'enrollment_agreement'::text])
) h
WHERE h.customer_id IN (
    SELECT cm.customer_id FROM public.child_enrollment_agreements a
      JOIN public.customer_members cm ON cm.id = a.customer_member_id
     WHERE cm.customer_id IS NOT NULL
       AND a.status = ANY (ARRAY['pending_start'::text, 'active'::text, 'ending'::text])
     GROUP BY cm.customer_id HAVING count(DISTINCT a.site_location_id) > 1)
GROUP BY h.customer_id

UNION ALL

-- q3  any canonical period already materialized for them, which would be contrary evidence about
--     cadence that must not be overwritten
SELECT 'q3', 'row',
       json_build_object(
           'customer_id', p.customer_id, 'period_key', p.period_key, 'cadence', p.cadence,
           'calendar_scope', p.calendar_scope, 'status', p.status
       )::text
FROM public.financial_billing_periods p
WHERE p.customer_id IN (
    SELECT cm.customer_id FROM public.child_enrollment_agreements a
      JOIN public.customer_members cm ON cm.id = a.customer_member_id
     WHERE cm.customer_id IS NOT NULL
       AND a.status = ANY (ARRAY['pending_start'::text, 'active'::text, 'ending'::text])
     GROUP BY cm.customer_id HAVING count(DISTINCT a.site_location_id) > 1)

UNION ALL

-- q4  HISTORICAL 35 PRESERVATION BASELINE, so post-deploy comparison is exact
SELECT 'q4', 'row',
       json_build_object(
           'draft_charges', count(*),
           'gross_cents', coalesce(sum(c.amount_cents), 0),
           'all_legacy', bool_and(c.billing_period_generation = 'legacy'),
           'any_with_period_id', bool_or(c.billing_period_id IS NOT NULL),
           'any_with_post_attempt', bool_or(c.metadata ? 'post_attempt'),
           'ids_digest', md5(string_agg(c.id::text, ',' ORDER BY c.id))
       )::text
FROM public.charges c
WHERE c.status = 'draft'

ORDER BY 1
