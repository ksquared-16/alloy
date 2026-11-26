-- =============================================================================
-- Action links gain REVOCATION.
--
-- `action_links` is already the platform's generalized bounded-action token: a
-- hashed bearer credential carrying an org, a subject (`entity_type` +
-- `entity_id`), one allowed `action_type`, an expiry, and single-use
-- consumption. Thread 6's parent tokenized intent needs exactly that, and the
-- right answer to "we need a bounded family-facing token" is to use the one the
-- platform owns rather than to introduce `attendance_parent_tokens` beside it.
--
-- One capability is genuinely missing. Withdrawing a live credential is not the
-- same act as consuming it or letting it lapse:
--
--   expires_at    the credential aged out on its own schedule
--   consumed_at   somebody legitimately USED it
--   revoked_at    somebody TOOK IT BACK before either happened
--
-- Collapsing revocation into either of the others loses the distinction that
-- matters during an incident. Back-dating `expires_at` would make a withdrawn
-- link indistinguishable from one that simply timed out, and writing
-- `consumed_at` would assert that a parent submitted something they never did —
-- a false record of a family's action, in the audit trail, to achieve a
-- security outcome. Revocation gets its own column and says what happened.
--
-- Additive and nullable: every existing row is unrevoked, every existing
-- consumer keeps working unchanged, and nothing about the credential's
-- lifecycle changes for links that are never revoked.
-- =============================================================================

ALTER TABLE public.action_links
    ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

ALTER TABLE public.action_links
    ADD COLUMN IF NOT EXISTS revoked_reason text;

COMMENT ON COLUMN public.action_links.revoked_at IS
    'When the link was withdrawn by the organization. Distinct from expires_at (lapsed on schedule) and consumed_at (legitimately used). A revoked link fails closed at authorization.';
COMMENT ON COLUMN public.action_links.revoked_reason IS
    'Operator-facing reason the link was withdrawn. Never shown to the bearer — a public message that varies by cause is an oracle.';
