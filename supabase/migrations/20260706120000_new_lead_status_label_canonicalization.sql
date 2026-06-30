-- =============================================================================
-- New Lead status label canonicalization — eliminate "Inquiry" copy.
--
-- Product language is "Lead", not "Inquiry". The legacy `new_inquiry` status key is RETAINED
-- (the queue lane and existing rows still use it), but its operator-facing LABEL must read
-- "New Lead" — never "New Inquiry". This relabels existing `new_inquiry` definitions for both
-- `opportunities` (case status) and `opportunity_customer_members` (child status) across all orgs.
--
-- This migration does NOT introduce a `new_lead` key and does NOT change any status_key, so the
-- opportunity queue/lifecycle config that currently accepts `new_inquiry` keeps working unchanged.
-- (Create Lead now writes NULL for child outcome_status_key — no enrollment disposition until
-- enrollment starts — so new leads have no child badge at all.)
-- =============================================================================

UPDATE public.status_definitions
SET status_label = 'New Lead'
WHERE status_key = 'new_inquiry'
  AND entity_type IN ('opportunities', 'opportunity_customer_members')
  AND status_label IS DISTINCT FROM 'New Lead';
