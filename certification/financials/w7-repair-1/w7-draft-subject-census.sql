-- Does the W7 SUBJECT household carry any of the 35 residual drafts?
--
-- The previous run's readiness gate answered "no scenario depends on residue we declared
-- irrelevant" on the grounds that `has_draft` is evaluated against the QA subject household's own
-- draftCount rather than the org's. That reasoning is only sound if the subject household has no
-- residual drafts. This checks it, because the claim was made to the Director and a wrong one
-- should be corrected rather than left standing.
--
-- The subject is `fd000000-0000-4000-8000-0000000c0001` (Alvarez Household (demo)), from
-- `web/lib/qa/financialsDirectorQa/readiness.ts`.
--
-- READ-ONLY. Counts only.
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'subject_customer_id', 'fd000000-0000-4000-8000-0000000c0001',
           'subject_draft_charges', count(*) FILTER (WHERE c.status = 'draft'),
           'subject_posted_charges', count(*) FILTER (WHERE c.status = 'posted'),
           'subject_total_charges', count(*)
       )::text AS payload
  FROM public.charges c
  LEFT JOIN public.child_enrollment_agreements a
         ON a.id = c.billable_source_id AND c.billable_source_type = 'enrollment_agreement'
 WHERE coalesce(a.customer_id::text, c.billable_source_id::text) = 'fd000000-0000-4000-8000-0000000c0001'

UNION ALL

-- Where the 35 drafts actually live, by household, so the answer is proportionate.
SELECT 'q2', 'row',
       json_build_object(
           'households_holding_drafts', count(DISTINCT coalesce(a.customer_id::text, c.billable_source_id::text)),
           'drafts_on_subject', count(*) FILTER (
               WHERE coalesce(a.customer_id::text, c.billable_source_id::text) = 'fd000000-0000-4000-8000-0000000c0001'),
           'drafts_total', count(*)
       )::text AS payload
  FROM public.charges c
  LEFT JOIN public.child_enrollment_agreements a
         ON a.id = c.billable_source_id AND c.billable_source_type = 'enrollment_agreement'
 WHERE c.status = 'draft'
