-- S2 — THE NEW CANONICAL ROWS, read back after the functional run.
--
-- q1  every canonical charge, with the period it names and that period's own facts
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'charge_id', c.id,
           'generation', c.billing_period_generation,
           'legacy_key', c.legacy_billing_period_key,
           'billing_period_id', c.billing_period_id,
           'period_key', p.period_key,
           'period_span', (p.starts_on::text || '..' || p.ends_on::text),
           'cadence', p.cadence,
           'calendar_scope', p.calendar_scope,
           'period_customer', p.customer_id,
           'charge_source_type', c.billable_source_type,
           'charge_source_id', c.billable_source_id,
           'service_date', c.service_date,
           'billable_on', c.billable_on,
           'date_inside_period', (coalesce(c.billable_on, c.occurs_on, c.service_date)
                                  BETWEEN p.starts_on AND p.ends_on)
       )::text AS payload
FROM public.charges c
JOIN public.financial_billing_periods p ON p.id = c.billing_period_id
WHERE c.billing_period_generation = 'canonical'

UNION ALL

-- q2  generations now present, so legacy history is untouched by the new writes
SELECT 'q2', 'row',
       json_build_object(
           'generation', c.billing_period_generation,
           'charges', count(*),
           'with_period_id', count(*) FILTER (WHERE c.billing_period_id IS NOT NULL),
           'with_legacy_key', count(*) FILTER (WHERE c.legacy_billing_period_key IS NOT NULL)
       )::text
FROM public.charges c
GROUP BY c.billing_period_generation

UNION ALL

-- q3  THE OPEN-NOVEMBER QUESTION: two charges, one period, and what the period now holds
SELECT 'q3', 'row',
       json_build_object(
           'customer_id', p.customer_id,
           'period_key', p.period_key,
           'cadence', p.cadence,
           'status', p.status,
           'charges_bound', count(c.id),
           'gross_cents', coalesce(sum(c.amount_cents), 0),
           'all_same_period', true
       )::text
FROM public.financial_billing_periods p
JOIN public.charges c ON c.billing_period_id = p.id
GROUP BY p.customer_id, p.period_key, p.cadence, p.status

UNION ALL

-- q4  the AMBIGUOUS household wrote NOTHING: no charge, and no period invented for it
SELECT 'q4', 'row',
       json_build_object(
           'customer_id', '50b19065-51fd-41e4-83c9-07ba787759f0',
           'canonical_charges', (SELECT count(*) FROM public.charges c
               WHERE c.billing_period_generation = 'canonical'
                 AND c.billable_source_id = '50b19065-51fd-41e4-83c9-07ba787759f0'),
           'any_charge_dated_2026_11_18', (SELECT count(*) FROM public.charges c
               WHERE c.billable_source_id = '50b19065-51fd-41e4-83c9-07ba787759f0'
                 AND c.service_date = '2026-11-18'),
           'periods_held', (SELECT count(*) FROM public.financial_billing_periods p
               WHERE p.customer_id = '50b19065-51fd-41e4-83c9-07ba787759f0')
       )::text

UNION ALL

-- q5  PAYMENTS REMAIN ACCOUNT-WIDE: one payment, allocations reaching charges whose commercial
--     periods differ, and the payment itself carrying no period identity of its own
SELECT 'q5', 'row',
       json_build_object(
           'payment_id', pa.payment_id,
           'allocations', count(*),
           'distinct_charge_generations', count(DISTINCT c.billing_period_generation),
           'distinct_billing_periods', count(DISTINCT c.billing_period_id),
           'spans_more_than_one_period', (count(DISTINCT c.billing_period_id) > 1)
       )::text
FROM public.payment_allocations pa
JOIN public.charges c ON c.id = pa.charge_id
GROUP BY pa.payment_id
HAVING count(*) > 1

UNION ALL

-- q6  ACCOUNTING INDEPENDENCE: a journal entry answers its accounting period through its own
--     attribution, and nothing derives it from a commercial period
SELECT 'q6', 'row',
       json_build_object(
           'entries', count(*),
           'attributed', count(*) FILTER (WHERE j.period_attribution = 'attributed'),
           'no_calendar', count(*) FILTER (WHERE j.period_attribution = 'no_calendar'),
           'with_accounting_period', count(*) FILTER (WHERE j.accounting_period_id IS NOT NULL),
           'journal_has_billing_period_id_column', (SELECT count(*) FROM information_schema.columns
               WHERE table_schema='public' AND table_name='financial_journal_entries'
                 AND column_name='billing_period_id')
       )::text
FROM public.financial_journal_entries j

ORDER BY 1
