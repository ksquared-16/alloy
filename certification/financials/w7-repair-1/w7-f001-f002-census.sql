-- W7 REPAIR SLICE 1 — the two questions code reading cannot answer.
--
-- F001: what actually makes a charge draft on the deployed tenant, and are any drafts sitting in a
--       billing period that has not started? That is the Director's proposed contract, so it matters
--       whether the estate already contains the case.
-- F002: is the actor identity missing because the operator has no linked person, or because the
--       link exists and we were reading the wrong source? The repair prefers `user_person_links`
--       -> `persons`; if no operator is linked, the repair helps nobody and the answer is an
--       identity requirement rather than a read defect.
--
-- READ-ONLY. No person is named and no email is selected — only counts and shapes, so nothing here
-- carries PII.
--
-- q1  posting_review policy: is a configured review boundary why drafts exist at all?
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'posting_review_policies', count(*),
           'active', count(*) FILTER (WHERE is_active),
           'scopes', json_agg(DISTINCT scope_type)
       )::text AS payload
  FROM public.financial_policies
 WHERE policy_type = 'posting_review'

UNION ALL

-- q2  the draft population, by what the auto-post repair recorded about each one.
SELECT 'q2', 'row',
       json_build_object(
           'draft_charges', count(*),
           'post_gate_posted', count(*) FILTER (WHERE metadata ->> 'post_gate' = 'posted'),
           'post_gate_review_required', count(*) FILTER (WHERE metadata ->> 'post_gate' = 'review_required'),
           'post_gate_post_failed', count(*) FILTER (WHERE metadata ->> 'post_gate' = 'post_failed'),
           'never_attempted', count(*) FILTER (WHERE metadata -> 'post_attempt' IS NULL
                                                 AND (metadata ->> 'post_gate') IS NULL),
           'oldest_created_at', min(created_at)
       )::text AS payload
  FROM public.charges
 WHERE status = 'draft'

UNION ALL

-- q3  THE DIRECTOR'S CASE: posted charges whose billing period has not begun, and drafts likewise.
--     If the contract were implemented, the first group is what would have waited.
SELECT 'q3', 'row',
       json_build_object(
           'posted_in_future_period', count(*) FILTER (WHERE c.status = 'posted' AND bp.starts_on > current_date),
           'draft_in_future_period',  count(*) FILTER (WHERE c.status = 'draft'  AND bp.starts_on > current_date),
           'posted_in_started_period', count(*) FILTER (WHERE c.status = 'posted' AND bp.starts_on <= current_date),
           'charges_bound_to_a_period', count(*)
       )::text AS payload
  FROM public.charges c
  JOIN public.financial_billing_periods bp ON bp.id = c.billing_period_id

UNION ALL

-- q4  F002: do the operators who created financial activity resolve to a NAMED person?
SELECT 'q4', 'row',
       json_build_object(
           'distinct_charge_creators', count(*),
           'with_active_person_link', count(*) FILTER (WHERE a.person_id IS NOT NULL),
           'link_resolves_to_named_person', count(*) FILTER (WHERE a.named),
           'charges_with_no_creator', (SELECT count(*) FROM public.charges WHERE created_by IS NULL)
       )::text AS payload
  FROM (
      SELECT DISTINCT c.created_by AS user_id
        FROM public.charges c
       WHERE c.created_by IS NOT NULL
  ) creators
  LEFT JOIN LATERAL (
      SELECT upl.person_id,
             coalesce(nullif(trim(p.full_name), ''),
                      nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')) IS NOT NULL AS named
        FROM public.user_person_links upl
        LEFT JOIN public.persons p ON p.id = upl.person_id
       WHERE upl.user_id = creators.user_id
         AND upl.status = 'active'
       LIMIT 1
  ) a ON true

UNION ALL

-- q5  how many distinct humans have EVER created a charge, so the above is read in proportion.
SELECT 'q5', 'row',
       json_build_object(
           'total_charges', (SELECT count(*) FROM public.charges),
           'distinct_creators', (SELECT count(DISTINCT created_by) FROM public.charges WHERE created_by IS NOT NULL),
           'active_user_person_links', (SELECT count(*) FROM public.user_person_links WHERE status = 'active')
       )::text AS payload
