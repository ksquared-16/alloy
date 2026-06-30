-- =============================================================================
-- Operational Consumption — Draft Obligation Review lifecycle (Slice 4)
-- =============================================================================
-- Slices 1–3 produce Resolved Obligations (and draft Charges). Slice 4 adds the
-- PRE-POSTING REVIEW surface operators need before Posting exists: a review
-- lifecycle on `resolved_obligations` so an operator can mark reviewed, flag,
-- suppress/restore, and recompute — and decide whether an obligation should
-- remain eligible for FUTURE Posting.
--
-- Doctrine: docs/platform/modules/operational-consumption-platform.md
--   * This is review, NOT Posting. Posting (the only authoritative money write),
--     invoices, payments, statements, and the ledger remain downstream.
--   * `review_status` (review lifecycle) is DISTINCT from `resolved_obligations.status`
--     (resolution lifecycle: previewed/drafted/no_charge/superseded) and from
--     `charges.status` (the charge lifecycle). They never overlap.
--
-- ADDITIVE ONLY: nullable/defaulted columns + a CHECK + an index + a backfill of
-- the new column from the existing review_required flag. No money writes.
-- =============================================================================

ALTER TABLE public.resolved_obligations
    ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
    ADD COLUMN IF NOT EXISTS reviewed_by uuid,
    ADD COLUMN IF NOT EXISTS suppression_reason text;

COMMENT ON COLUMN public.resolved_obligations.review_status IS
    'Pre-posting REVIEW lifecycle (distinct from status / charges.status): pending | review_required | reviewed | suppressed | stale. A suppressed obligation is NOT eligible for future Posting; a stale obligation was recomputed and changed and needs re-review.';
COMMENT ON COLUMN public.resolved_obligations.suppression_reason IS
    'Why an obligation was suppressed (operator review). Suppression is reversible (restore); it writes no money.';

-- Frozen review-status vocabulary (mirror: web/lib/operationalConsumption/obligationReviewTypes.ts).
ALTER TABLE public.resolved_obligations
    DROP CONSTRAINT IF EXISTS resolved_obligations_review_status_check;
ALTER TABLE public.resolved_obligations
    ADD CONSTRAINT resolved_obligations_review_status_check
        CHECK (review_status = ANY (ARRAY['pending'::text, 'review_required'::text, 'reviewed'::text, 'suppressed'::text, 'stale'::text]));

-- Backfill: obligations that already flagged review_required start in review_required.
UPDATE public.resolved_obligations
    SET review_status = 'review_required'
    WHERE review_required = true AND review_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_resolved_obligations_org_review_status
    ON public.resolved_obligations (org_id, review_status);
