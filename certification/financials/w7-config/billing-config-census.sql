-- W7 BILLING CONFIGURATION CONVERGENCE — WHAT DOES STAGING ACTUALLY RESOLVE, AND WHY?
--
-- Read-only. One statement, three columns per row (question_id | kind | payload).
-- No names, emails or free text from people: ids are truncated, values are policy JSON.
--
-- q1  every financial_policies row: the full configuration the resolver chooses from
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'id8', left(p.id::text, 8),
           'policy_type', p.policy_type,
           'scope_type', p.scope_type,
           'location8', left(p.location_id::text, 8),
           'service8', left(p.service_id::text, 8),
           'rate_plan8', left(p.rate_plan_id::text, 8),
           'customer8', left(p.customer_id::text, 8),
           'value', p.value,
           'is_active', p.is_active,
           'effective_start', p.effective_start,
           'effective_end', p.effective_end,
           'supersedes8', left(p.metadata->>'supersedes_id', 8),
           'created_on', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
       )::text AS payload
  FROM public.financial_policies p

UNION ALL

-- q2  every charge template's date strategies — the invoice-timing authority today
SELECT 'q2', 'row',
       json_build_object(
           'id8', left(t.id::text, 8),
           'template_key', t.template_key,
           'charge_category', t.charge_category,
           'service8', left(t.service_id::text, 8),
           'occurs_on_strategy', t.occurs_on_strategy,
           'billable_on_strategy', t.billable_on_strategy,
           'billable_offset_days', t.billable_offset_days,
           'amount_strategy', t.amount_strategy,
           'review_required', t.review_required,
           'is_active', t.is_active,
           'effective_start', t.effective_start,
           'effective_end', t.effective_end
       )::text
  FROM public.financial_charge_templates t

UNION ALL

-- q3  every charge whose service or occurrence date is in Nov 2026: the Director's Nov 5 case
SELECT 'q3', 'row',
       json_build_object(
           'id8', left(c.id::text, 8),
           'charge_type', c.charge_type,
           'status', c.status,
           'source', c.metadata->>'source',
           'template8', left(c.charge_template_id::text, 8),
           'service_date', c.service_date,
           'occurs_on', c.occurs_on,
           'billable_on', c.billable_on,
           'due_date', c.due_date,
           'posted_on', to_char(c.posted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
           'created_on', to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
           'period_key', bp.period_key,
           'period_starts_on', bp.starts_on,
           'period_calendar_scope', bp.calendar_scope,
           'period_calendar_policy8', left(bp.calendar_policy_id::text, 8),
           'period_snapshot', bp.calendar_snapshot,
           'post_gate', c.metadata->>'post_gate',
           'post_not_before', c.metadata->>'post_not_before',
           'due_strategy', c.metadata->>'due_date_strategy'
       )::text
  FROM public.charges c
  LEFT JOIN public.financial_billing_periods bp ON bp.id = c.billing_period_id
 WHERE c.service_date BETWEEN DATE '2026-11-01' AND DATE '2026-11-30'
    OR c.occurs_on BETWEEN DATE '2026-11-01' AND DATE '2026-11-30'

UNION ALL

-- q4  HISTORICAL IMPACT: of charges bound to a persisted period, how many sit in a period that
--     does NOT contain their own service date — i.e. how many would move if membership followed
--     the service date instead of billable_on?
SELECT 'q4', 'row',
       json_build_object(
           'charge_type', c.charge_type,
           'source', coalesce(c.metadata->>'source', '(null)'),
           'billable_on_strategy', coalesce(t.billable_on_strategy, '(no template)'),
           'status', c.status,
           'bound', count(*),
           'service_date_inside_period', count(*) FILTER (WHERE c.service_date BETWEEN bp.starts_on AND bp.ends_on),
           'service_date_before_period', count(*) FILTER (WHERE c.service_date < bp.starts_on),
           'service_date_after_period', count(*) FILTER (WHERE c.service_date > bp.ends_on),
           'service_date_null', count(*) FILTER (WHERE c.service_date IS NULL)
       )::text
  FROM public.charges c
  JOIN public.financial_billing_periods bp ON bp.id = c.billing_period_id
  LEFT JOIN public.financial_charge_templates t ON t.id = c.charge_template_id
 GROUP BY c.charge_type, coalesce(c.metadata->>'source', '(null)'),
          coalesce(t.billable_on_strategy, '(no template)'), c.status

UNION ALL

-- q5  the persisted commercial periods: what cadences and scopes actually answered
SELECT 'q5', 'row',
       json_build_object(
           'cadence', bp.cadence,
           'calendar_scope', bp.calendar_scope,
           'calendar_policy8', left(bp.calendar_policy_id::text, 8),
           'status', bp.status,
           'periods', count(*),
           'customers', count(DISTINCT bp.customer_id),
           'first_start', min(bp.starts_on),
           'last_end', max(bp.ends_on)
       )::text
  FROM public.financial_billing_periods bp
 GROUP BY bp.cadence, bp.calendar_scope, left(bp.calendar_policy_id::text, 8), bp.status

UNION ALL

-- q6  the accounting calendar, kept separate
SELECT 'q6', 'row',
       json_build_object(
           'calendar8', left(ac.id::text, 8),
           'period_style', ac.period_style,
           'is_active', ac.is_active,
           'periods', (SELECT count(*) FROM public.financial_accounting_periods ap WHERE ap.calendar_id = ac.id),
           'open', (SELECT count(*) FROM public.financial_accounting_periods ap WHERE ap.calendar_id = ac.id AND ap.status = 'open'),
           'closed', (SELECT count(*) FROM public.financial_accounting_periods ap WHERE ap.calendar_id = ac.id AND ap.status = 'closed'),
           'first_start', (SELECT min(ap.starts_on) FROM public.financial_accounting_periods ap WHERE ap.calendar_id = ac.id),
           'last_end', (SELECT max(ap.ends_on) FROM public.financial_accounting_periods ap WHERE ap.calendar_id = ac.id)
       )::text
  FROM public.financial_accounting_calendars ac

UNION ALL

-- q7  tenancy and the clock: how many orgs, which timezone, which locations exist
SELECT 'q7', 'row',
       json_build_object(
           'orgs', (SELECT count(*) FROM public.orgs),
           'locations', (SELECT count(*) FROM public.locations),
           'customers', (SELECT count(*) FROM public.customers),
           'charges', (SELECT count(*) FROM public.charges),
           'charges_bound', (SELECT count(*) FROM public.charges WHERE billing_period_id IS NOT NULL),
           'activation_schedules', (SELECT count(*) FROM public.scheduled_work
                                     WHERE handler_key = 'financials.future_period_charge.activate')
       )::text
