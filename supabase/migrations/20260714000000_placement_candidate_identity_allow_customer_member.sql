-- =============================================================================
-- placement_candidates: allow a REAL (non-synthetic) candidate to be identified by the child
-- subject (customer_member_id) WITHOUT an OCM id.
-- =============================================================================
-- The prior constraint required opportunity_customer_member_id IS NOT NULL for every non-synthetic
-- candidate, coupling waitlist placement to opportunity_customer_members (OCM). The OCM-free runtime
-- creates the waitlist candidate from process-instance / child-subject scope
-- (ensurePlacementCandidateForWaitlistedChildBySubject) with customer_member_id set and
-- opportunity_customer_member_id NULL. This relaxes the identity rule so a real candidate is valid when
-- it carries EITHER a child subject id OR a legacy OCM id. Synthetic rows are unchanged. Backward
-- compatible: existing rows (OCM id present) still satisfy the constraint.
--
-- NOT APPLIED — required by the OCM-free waitlist path; apply after review/approval.
-- =============================================================================

ALTER TABLE public.placement_candidates
    DROP CONSTRAINT IF EXISTS placement_candidates_synthetic_identity_check;

ALTER TABLE public.placement_candidates
    ADD CONSTRAINT placement_candidates_synthetic_identity_check CHECK (
        (
            is_synthetic_fallback = true
            AND opportunity_customer_member_id IS NULL
            AND customer_member_id IS NULL
            AND person_id IS NULL
        )
        OR (
            is_synthetic_fallback = false
            AND (customer_member_id IS NOT NULL OR opportunity_customer_member_id IS NOT NULL)
        )
    );
