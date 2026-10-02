-- WHAT WOULD CLOSE DO TO THE DRAFTS THAT ARE ALREADY THERE?
--
-- Section 15 asks this to be MEASURED rather than chosen silently, and the measurement matters more
-- than it first appears, because of how posting works:
--
--   posting a draft is `UPDATE charges SET status = 'posted'` — it is NOT an insert.
--
-- So the closed-period guard section 11 names, which lives in `bindChargeBillingPeriod` at CREATION,
-- cannot see it. A draft already bound to November can be posted after November closes, and money
-- would enter a closed commercial period through a path no creation-time guard touches.
--
-- Read-only.
--
-- q1  every draft, by generation and by the period it is bound to
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'generation', c.billing_period_generation,
           'drafts', count(*),
           'bound_to_a_canonical_period', count(*) FILTER (WHERE c.billing_period_id IS NOT NULL),
           'legacy_only', count(*) FILTER (WHERE c.billing_period_id IS NULL),
           'gross_cents_at_stake', coalesce(sum(c.amount_cents), 0)
       )::text AS payload
FROM public.charges c
WHERE c.status = 'draft'
GROUP BY c.billing_period_generation

UNION ALL

-- q2  drafts bound to a CANONICAL period, with that period's status and bounds — these are the rows
--     a close decision actually governs
SELECT 'q2', 'row',
       json_build_object(
           'period_key', p.period_key,
           'period_status', p.status,
           'period_span', (p.starts_on::text || '..' || p.ends_on::text),
           'cadence', p.cadence,
           'customer_id', p.customer_id,
           'drafts', count(c.id),
           'gross_cents', coalesce(sum(c.amount_cents), 0),
           'period_already_ended', (p.ends_on < current_date)
       )::text
FROM public.charges c
JOIN public.financial_billing_periods p ON p.id = c.billing_period_id
WHERE c.status = 'draft'
GROUP BY p.period_key, p.status, p.starts_on, p.ends_on, p.cadence, p.customer_id

UNION ALL

-- q3  WHICH PRODUCERS make drafts that persist — the four section 15 names
SELECT 'q3', 'row',
       json_build_object(
           'source', coalesce(c.metadata ->> 'source', '(none)'),
           'charge_category', c.charge_category,
           'billable_source_type', c.billable_source_type,
           'drafts', count(*),
           'oldest', min(c.created_at),
           'newest', max(c.created_at),
           'review_required_flag', count(*) FILTER (WHERE (c.metadata ->> 'review_required') = 'true')
       )::text
FROM public.charges c
WHERE c.status = 'draft'
GROUP BY coalesce(c.metadata ->> 'source', '(none)'), c.charge_category, c.billable_source_type

UNION ALL

-- q4  is a review boundary even configured? A draft only persists where one is, or where a post
--     failed, so this says how a draft can arise at all on this estate.
SELECT 'q4', 'row',
       json_build_object(
           'policy_type', p.policy_type,
           'rows', count(*),
           'scopes', json_agg(DISTINCT p.scope_type),
           'values', json_agg(DISTINCT p.value)
       )::text
FROM public.financial_policies p
WHERE p.policy_type IN ('posting_review', 'draft_expiration')
GROUP BY p.policy_type

UNION ALL

-- q5  reduction drafts — the fourth producer, on its own table
SELECT 'q5', 'row',
       json_build_object(
           'reduction_rows', count(*),
           'distinct_generations', count(DISTINCT r.billing_period_generation),
           'bound_to_canonical_period', count(*) FILTER (WHERE r.billing_period_id IS NOT NULL),
           'reversed', count(*) FILTER (WHERE r.reversed_by_id IS NOT NULL)
       )::text
FROM public.financial_reduction_applications r

UNION ALL

-- q6  resolved obligations still in a pre-posting state, which is the generated/tuition producer
SELECT 'q6', 'row',
       json_build_object(
           'status', o.status,
           'review_status', o.review_status,
           'rows', count(*),
           'with_draft_charge', count(*) FILTER (WHERE o.draft_charge_id IS NOT NULL)
       )::text
FROM public.resolved_obligations o
GROUP BY o.status, o.review_status

ORDER BY 1
