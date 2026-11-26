-- S2 DEPLOYED PROOF — sections 8 and 9. The catalog and the rows, not an apply label.
--
-- q1  the new columns on both tables
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object('table', c.table_name, 'column', c.column_name, 'type', c.data_type,
                         'nullable', c.is_nullable, 'default', c.column_default)::text AS payload
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('charges', 'financial_reduction_applications')
  AND c.column_name IN ('billing_period_id', 'legacy_billing_period_key', 'billing_period_generation')

UNION ALL

-- q2  the generation vocabulary, the shape rules, and the childcare guard
SELECT 'q2', 'row',
       json_build_object('table', c.conrelid::regclass::text, 'constraint', c.conname,
                         'validated', c.convalidated, 'definition', pg_get_constraintdef(c.oid))::text
FROM pg_constraint c
WHERE c.conrelid IN ('public.charges'::regclass, 'public.financial_reduction_applications'::regclass)
  AND c.conname LIKE '%billing_period%'

UNION ALL

-- q3  the immutability triggers on both tables
SELECT 'q3', 'row',
       json_build_object('table', t.tgrelid::regclass::text, 'trigger', t.tgname)::text
FROM pg_trigger t
WHERE t.tgrelid IN ('public.charges'::regclass, 'public.financial_reduction_applications'::regclass)
  AND NOT t.tgisinternal
  AND t.tgname LIKE '%billing_period%'

UNION ALL

-- q4  S1's overlap exclusion is UNCHANGED — S2 must not have reshaped it
SELECT 'q4', 'row',
       json_build_object('constraint', c.conname, 'definition', pg_get_constraintdef(c.oid),
                         'validated', c.convalidated)::text
FROM pg_constraint c
WHERE c.conrelid = 'public.financial_billing_periods'::regclass
  AND c.contype = 'x'

UNION ALL

-- q5  HISTORICAL MEMBERSHIP: every childcare charge, by generation
SELECT 'q5', 'row',
       json_build_object(
           'billing_period_generation', c.billing_period_generation,
           'charges', count(*),
           'with_period_id', count(*) FILTER (WHERE c.billing_period_id IS NOT NULL),
           'with_legacy_key', count(*) FILTER (WHERE c.legacy_billing_period_key IS NOT NULL),
           'childcare', count(*) FILTER (WHERE c.billable_source_type = ANY (ARRAY['enrollment_agreement'::text,'customer'::text]))
       )::text
FROM public.charges c
GROUP BY c.billing_period_generation

UNION ALL

-- q6  ZERO canonical period rows were invented for history — the whole point of option B
SELECT 'q6', 'row',
       json_build_object(
           'billing_period_rows_total', (SELECT count(*) FROM public.financial_billing_periods),
           'rows_referenced_by_a_legacy_charge',
               (SELECT count(*) FROM public.charges c
                 WHERE c.billing_period_generation = 'legacy' AND c.billing_period_id IS NOT NULL),
           'legacy_charges_carrying_a_period_id',
               (SELECT count(*) FROM public.charges c
                 WHERE c.billing_period_generation = 'legacy' AND c.billing_period_id IS NOT NULL)
       )::text

UNION ALL

-- q7  representative legacy rows across months and customers
SELECT 'q7', 'row',
       json_build_object(
           'legacy_billing_period_key', c.legacy_billing_period_key,
           'charges', count(*),
           'customers', count(DISTINCT c.billable_source_id),
           'all_null_period_id', bool_and(c.billing_period_id IS NULL)
       )::text
FROM public.charges c
WHERE c.billing_period_generation = 'legacy'
GROUP BY c.legacy_billing_period_key

UNION ALL

-- q8  THE OVERLAP THAT WOULD HAVE BLOCKED OPTION A causes nothing, because the legacy charge holds
--     no canonical period row at all
SELECT 'q8', 'row',
       json_build_object(
           'customer_id', '29944d3e-8267-45b7-8dcb-7405060e2573',
           'legacy_charges_in_2026_12', (SELECT count(*) FROM public.charges c
               WHERE c.billable_source_type = 'customer'
                 AND c.billable_source_id = '29944d3e-8267-45b7-8dcb-7405060e2573'
                 AND c.legacy_billing_period_key = '2026-12'),
           'canonical_periods_still_held', (SELECT count(*) FROM public.financial_billing_periods p
               WHERE p.customer_id = '29944d3e-8267-45b7-8dcb-7405060e2573'),
           'any_legacy_charge_bound_to_one', (SELECT count(*) FROM public.charges c
               WHERE c.billable_source_id = '29944d3e-8267-45b7-8dcb-7405060e2573'
                 AND c.billing_period_generation = 'legacy' AND c.billing_period_id IS NOT NULL)
       )::text

UNION ALL

-- q9  historical reductions keep their legacy membership
SELECT 'q9', 'row',
       json_build_object(
           'billing_period_generation', r.billing_period_generation,
           'reductions', count(*),
           'with_legacy_key', count(*) FILTER (WHERE r.legacy_billing_period_key IS NOT NULL),
           'with_period_id', count(*) FILTER (WHERE r.billing_period_id IS NOT NULL),
           'legacy_keys_match_period_key', count(*) FILTER (WHERE r.legacy_billing_period_key = r.period_key)
       )::text
FROM public.financial_reduction_applications r
GROUP BY r.billing_period_generation

UNION ALL

-- q10 payments and allocations acquired NO period identity
SELECT 'q10', 'row',
       json_build_object(
           'payments_with_period_column', (SELECT count(*) FROM information_schema.columns
               WHERE table_schema='public' AND table_name='payments' AND column_name LIKE '%billing_period%'),
           'allocations_with_period_column', (SELECT count(*) FROM information_schema.columns
               WHERE table_schema='public' AND table_name='payment_allocations' AND column_name LIKE '%billing_period%'),
           'obligations_with_period_id', (SELECT count(*) FROM information_schema.columns
               WHERE table_schema='public' AND table_name='resolved_obligations' AND column_name = 'billing_period_id')
       )::text

ORDER BY 1
