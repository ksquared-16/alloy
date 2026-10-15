-- W7 BILLING CONFIGURATION — THE ORG DIMENSION. Which organization is W7, and how does each of its
-- households resolve its billing calendar, its payment terms and its templates?
--
-- The first census (billing-config-census.sql, gar_461e00056fc10a) read the estate without org_id:
-- 3 orgs, so rows could not be attributed. This one attributes every row and computes each
-- household's resolution chain with the SAME order the binder uses
-- (resolveCustomerBillingCalendar): explicit account calendar > ambiguous (>1 active location)
-- > single location's calendar > org default.
--
-- Read-only. One statement, three columns per row (question_id | kind | payload). Ids are truncated;
-- household names are emitted ONLY for demo fixtures (name contains "(demo)"), never for people.
--
-- o1  organizations
SELECT 'o1' AS question_id, 'org' AS kind,
       json_build_object(
           'org8', left(o.id::text, 8), 'name', o.name, 'slug', o.slug, 'status', o.status,
           'customers', (SELECT count(*) FROM public.customers c WHERE c.org_id = o.id),
           'demo_households', (SELECT count(*) FROM public.customers c WHERE c.org_id = o.id AND c.name ILIKE '%(demo)%'),
           'charges', (SELECT count(*) FROM public.charges ch WHERE ch.org_id = o.id),
           'policies', (SELECT count(*) FROM public.financial_policies p WHERE p.org_id = o.id),
           'templates', (SELECT count(*) FROM public.financial_charge_templates t WHERE t.org_id = o.id),
           'accounting_calendars', (SELECT count(*) FROM public.financial_accounting_calendars a WHERE a.org_id = o.id),
           'activation_schedules', (SELECT count(*) FROM public.scheduled_work w
                                     WHERE w.org_id = o.id AND w.handler_key = 'financials.future_period_charge.activate')
       )::text AS payload
  FROM public.orgs o

UNION ALL

-- o2  every financial_policies row, attributed to its org (billing timing types + due/review)
SELECT 'o2', 'policy',
       json_build_object(
           'org8', left(p.org_id::text, 8), 'id8', left(p.id::text, 8), 'policy_type', p.policy_type,
           'scope_type', p.scope_type, 'location8', left(p.location_id::text, 8),
           'location_label', (SELECT l.label FROM public.locations l WHERE l.id = p.location_id),
           'customer8', left(p.customer_id::text, 8),
           'customer_demo_name', (SELECT CASE WHEN c.name ILIKE '%(demo)%' THEN c.name END
                                    FROM public.customers c WHERE c.id = p.customer_id),
           'value', p.value, 'is_active', p.is_active,
           'effective_start', p.effective_start, 'effective_end', p.effective_end,
           'label', p.label
       )::text
  FROM public.financial_policies p

UNION ALL

-- o3  every charge template, attributed
SELECT 'o3', 'template',
       json_build_object(
           'org8', left(t.org_id::text, 8), 'id8', left(t.id::text, 8), 'template_key', t.template_key,
           'label', t.label, 'occurs_on_strategy', t.occurs_on_strategy,
           'billable_on_strategy', t.billable_on_strategy, 'billable_offset_days', t.billable_offset_days,
           'is_active', t.is_active
       )::text
  FROM public.financial_charge_templates t

UNION ALL

-- o4  every household's billing-calendar resolution chain, as the binder resolves it today
SELECT 'o4', 'household',
       json_build_object(
           'org8', left(c.org_id::text, 8), 'customer8', left(c.id::text, 8),
           'demo_name', CASE WHEN c.name ILIKE '%(demo)%' THEN c.name END,
           'customer_type', c.customer_type,
           'active_locations', loc.ids,
           'active_location_labels', loc.labels,
           'account_calendar', acct.value,
           'location_calendar', CASE WHEN array_length(loc.ids, 1) = 1 THEN lcal.value END,
           'org_calendar', ocal.value,
           'resolves_to', CASE
               WHEN acct.value IS NOT NULL THEN 'account'
               WHEN coalesce(array_length(loc.ids, 1), 0) > 1 THEN 'AMBIGUOUS_REFUSED'
               WHEN array_length(loc.ids, 1) = 1 AND lcal.value IS NOT NULL THEN 'location'
               WHEN ocal.value IS NOT NULL THEN 'org'
               ELSE 'UNCONFIGURED_REFUSED' END,
           'charges', (SELECT count(*) FROM public.charges ch
                        WHERE ch.org_id = c.org_id
                          AND ((ch.billable_source_type = 'customer' AND ch.billable_source_id = c.id)
                            OR (ch.billable_source_type = 'enrollment_agreement' AND ch.billable_source_id IN
                                (SELECT a.id FROM public.child_enrollment_agreements a WHERE a.customer_id = c.id))))
       )::text
  FROM public.customers c
  LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT left(a.site_location_id::text, 8)) FILTER (WHERE a.site_location_id IS NOT NULL) AS ids,
             array_agg(DISTINCT l.label) FILTER (WHERE l.label IS NOT NULL) AS labels,
             (array_agg(DISTINCT a.site_location_id) FILTER (WHERE a.site_location_id IS NOT NULL))[1] AS only_id
        FROM public.child_enrollment_agreements a
        LEFT JOIN public.locations l ON l.id = a.site_location_id
       WHERE a.org_id = c.org_id AND a.customer_id = c.id
         AND a.status IN ('pending_start', 'active', 'ending')
         AND (a.end_date IS NULL OR a.end_date >= current_date)
  ) loc ON true
  LEFT JOIN LATERAL (
      SELECT p.value FROM public.financial_policies p
       WHERE p.org_id = c.org_id AND p.policy_type = 'billing_calendar' AND p.scope_type = 'customer'
         AND p.customer_id = c.id AND p.is_active
         AND p.effective_start <= current_date AND (p.effective_end IS NULL OR p.effective_end >= current_date)
       ORDER BY p.effective_start DESC LIMIT 1
  ) acct ON true
  LEFT JOIN LATERAL (
      SELECT p.value FROM public.financial_policies p
       WHERE p.org_id = c.org_id AND p.policy_type = 'billing_calendar' AND p.scope_type = 'location'
         AND p.location_id = loc.only_id AND p.is_active
         AND p.effective_start <= current_date AND (p.effective_end IS NULL OR p.effective_end >= current_date)
       ORDER BY p.effective_start DESC LIMIT 1
  ) lcal ON true
  LEFT JOIN LATERAL (
      SELECT p.value FROM public.financial_policies p
       WHERE p.org_id = c.org_id AND p.policy_type = 'billing_calendar' AND p.scope_type = 'org'
         AND p.is_active
         AND p.effective_start <= current_date AND (p.effective_end IS NULL OR p.effective_end >= current_date)
       ORDER BY p.effective_start DESC LIMIT 1
  ) ocal ON true

UNION ALL

-- o5  locations of each org that carry a billing-calendar override, and how many live agreements sit there
SELECT 'o5', 'override_location',
       json_build_object(
           'org8', left(l.org_id::text, 8), 'location8', left(l.id::text, 8), 'label', l.label,
           'location_type', l.location_type, 'is_active', l.is_active,
           'live_agreements', (SELECT count(*) FROM public.child_enrollment_agreements a
                                WHERE a.site_location_id = l.id AND a.status IN ('pending_start', 'active', 'ending'))
       )::text
  FROM public.locations l
 WHERE EXISTS (SELECT 1 FROM public.financial_policies p
                WHERE p.location_id = l.id AND p.policy_type = 'billing_calendar')

UNION ALL

-- o6  accounting calendars, attributed
SELECT 'o6', 'accounting_calendar',
       json_build_object(
           'org8', left(ac.org_id::text, 8), 'calendar8', left(ac.id::text, 8), 'period_style', ac.period_style,
           'is_active', ac.is_active,
           'first_start', (SELECT min(ap.starts_on) FROM public.financial_accounting_periods ap WHERE ap.calendar_id = ac.id),
           'last_end', (SELECT max(ap.ends_on) FROM public.financial_accounting_periods ap WHERE ap.calendar_id = ac.id),
           'open', (SELECT count(*) FROM public.financial_accounting_periods ap WHERE ap.calendar_id = ac.id AND ap.status = 'open'),
           'closed', (SELECT count(*) FROM public.financial_accounting_periods ap WHERE ap.calendar_id = ac.id AND ap.status = 'closed')
       )::text
  FROM public.financial_accounting_calendars ac

UNION ALL

-- o7  the November 2026 charges, attributed to org and household (the Nov 18-24 December obligations)
SELECT 'o7', 'nov_charge',
       json_build_object(
           'org8', left(ch.org_id::text, 8), 'id8', left(ch.id::text, 8), 'status', ch.status,
           'source_type', ch.billable_source_type, 'source8', left(ch.billable_source_id::text, 8),
           'template8', left(ch.charge_template_id::text, 8),
           'service_date', ch.service_date, 'billable_on', ch.billable_on, 'due_date', ch.due_date,
           'period_key', (SELECT bp.period_key FROM public.financial_billing_periods bp WHERE bp.id = ch.billing_period_id)
       )::text
  FROM public.charges ch
 WHERE ch.service_date BETWEEN DATE '2026-11-01' AND DATE '2026-11-30'
