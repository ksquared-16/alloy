-- ── WHY THIS VERSION MOVED ──
--
-- This migration was authored as 20260911140000. Staging independently landed
-- 20260911140000_w13_portal_access_capability_admission.sql, which is the
-- registered authority for that version, so two different files claimed one
-- number.
--
-- The consequence was not a merge conflict -- there was no file overlap -- but a
-- silent one: alloy-cert recorded 20260911140000 as applied on the strength of
-- W-13, so the governed executor reported THIS migration as already applied and
-- skipped it, while `app_security_audit_outcome_check` never gained 'attempted'.
-- A ledger hit is not evidence that a migration ran.
--
-- Renamed to the next version free across staging and Thread 5. W-13 is
-- untouched.

-- Thread 5 Slice B.4 — an administrative act is recorded before it happens.
--
-- B.1 wrote `app_security_audit` with outcomes allowed | denied | error, which
-- describes something that has already finished. Productizing credential
-- issuance and revocation needs a fourth: `attempted`, written BEFORE the act.
--
-- The order is the point. Acting first and auditing second means a failed audit
-- produces a credential that exists, an operator told it does not, and no record
-- of either. Writing the intent first means a failed audit produces NOTHING —
-- the act is refused, which is safe and honest — and a failed FINALIZE still
-- leaves durable evidence that the act was begun, by whom, against what.
--
-- Invariant: no consequential administrative act can occur without a durable
-- record of the attempt already existing.
ALTER TABLE public.app_security_audit
    DROP CONSTRAINT IF EXISTS app_security_audit_outcome_check;

ALTER TABLE public.app_security_audit
    ADD CONSTRAINT app_security_audit_outcome_check
    CHECK (outcome IN ('attempted', 'allowed', 'denied', 'error'));

COMMENT ON COLUMN public.app_security_audit.outcome IS
    'attempted is written before a consequential administrative act and finalized to allowed or error afterwards. A row left at attempted means the act was begun and its completion was not recorded — which is information, not noise.';
