-- WHY IS EACH PERSISTENT DRAFT STILL A DRAFT?
--
-- Section 3 forbids grouping the 20 tuition drafts under one cause unless evidence proves they share
-- one. So this asks per row, and asks the questions that distinguish the categories: is the economics
-- complete, was a post ever attempted, is a review boundary configured, is an obligation still
-- mid-computation.
--
-- Read-only. Nothing here writes.
--
-- q1  EVERY persistent draft, one row each, with everything that could explain it
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'charge_id', c.id,
           'source', c.metadata ->> 'source',
           'category', c.charge_category,
           'generation', c.billing_period_generation,
           'legacy_key', c.legacy_billing_period_key,
           'period_id_present', (c.billing_period_id IS NOT NULL),
           'amount_cents', c.amount_cents,
           'has_amount', (c.amount_cents IS NOT NULL AND c.amount_cents <> 0),
           'due_date', c.due_date,
           'billable_on', c.billable_on,
           'occurs_on', c.occurs_on,
           'service_date', c.service_date,
           'created_at', c.created_at,
           'age_days', round(extract(epoch FROM (now() - c.created_at)) / 86400.0, 1),
           'created_by_set', (c.created_by IS NOT NULL),
           'review_required_meta', c.metadata ->> 'review_required',
           'lifecycle_status_meta', c.metadata ->> 'lifecycle_status',
           'post_failure_meta', c.metadata ->> 'post_failure',
           'post_attempted_meta', c.metadata ->> 'post_attempted',
           'metadata_keys', (SELECT json_agg(k ORDER BY k) FROM jsonb_object_keys(c.metadata) k),
           'has_allocation', EXISTS (SELECT 1 FROM public.financial_responsibility_allocations a WHERE a.charge_id = c.id),
           'has_arrangement', EXISTS (SELECT 1 FROM public.financial_responsibility_arrangements r WHERE r.charge_id = c.id)
       )::text AS payload
FROM public.charges c
WHERE c.status = 'draft'

UNION ALL

-- q2  ARE THE ECONOMICS COMPLETE? A draft that is missing an amount or a payer is category B
--     (unresolved); one that has everything is category D (nothing ever tried to post it).
SELECT 'q2', 'row',
       json_build_object(
           'source', c.metadata ->> 'source',
           'drafts', count(*),
           'with_amount', count(*) FILTER (WHERE c.amount_cents IS NOT NULL AND c.amount_cents <> 0),
           'with_due_date', count(*) FILTER (WHERE c.due_date IS NOT NULL),
           'with_billable_on', count(*) FILTER (WHERE c.billable_on IS NOT NULL),
           'with_responsibility', count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM public.financial_responsibility_arrangements r WHERE r.charge_id = c.id)),
           'review_required_true', count(*) FILTER (WHERE (c.metadata ->> 'review_required') = 'true'),
           'any_post_failure_recorded', count(*) FILTER (WHERE c.metadata ? 'post_failure'),
           'fully_resolved_and_unflagged', count(*) FILTER (WHERE
                 c.amount_cents IS NOT NULL AND c.amount_cents <> 0
             AND coalesce(c.metadata ->> 'review_required', 'false') <> 'true'
             AND NOT (c.metadata ? 'post_failure'))
       )::text
FROM public.charges c
WHERE c.status = 'draft'
GROUP BY c.metadata ->> 'source'

UNION ALL

-- q3  the obligation behind each tuition draft, and where it stopped
SELECT 'q3', 'row',
       json_build_object(
           'obligation_id', o.id,
           'status', o.status,
           'review_status', o.review_status,
           'reviewed_at', o.reviewed_at,
           'suppression_reason', o.suppression_reason,
           'draft_charge_id', o.draft_charge_id,
           'draft_charge_status', ch.status,
           'occurs_on', o.occurs_on,
           'billable_on', o.billable_on,
           'created_at', o.created_at,
           'age_days', round(extract(epoch FROM (now() - o.created_at)) / 86400.0, 1)
       )::text
FROM public.resolved_obligations o
LEFT JOIN public.charges ch ON ch.id = o.draft_charge_id

UNION ALL

-- q4  is ANY review or expiry boundary configured for ANY scope? Section 4's question.
SELECT 'q4', 'row',
       json_build_object(
           'posting_review_policies', (SELECT count(*) FROM public.financial_policies p
               WHERE p.policy_type = 'posting_review'),
           'draft_expiration_policies', (SELECT count(*) FROM public.financial_policies p
               WHERE p.policy_type = 'draft_expiration'),
           'all_policy_types_present', (SELECT json_agg(DISTINCT p.policy_type)
               FROM public.financial_policies p)
       )::text

UNION ALL

-- q5  STRANDED RISK (section 12): drafts with complete economics, no review flag, no recorded
--     failure — valid money that nothing is going to make real
SELECT 'q5', 'row',
       json_build_object(
           'stranded_candidates', count(*),
           'gross_cents', coalesce(sum(c.amount_cents), 0),
           'oldest_age_days', round(max(extract(epoch FROM (now() - c.created_at)) / 86400.0), 1),
           'sources', json_agg(DISTINCT c.metadata ->> 'source')
       )::text
FROM public.charges c
WHERE c.status = 'draft'
  AND c.amount_cents IS NOT NULL AND c.amount_cents <> 0
  AND coalesce(c.metadata ->> 'review_required', 'false') <> 'true'
  AND NOT (c.metadata ? 'post_failure')

ORDER BY 1
