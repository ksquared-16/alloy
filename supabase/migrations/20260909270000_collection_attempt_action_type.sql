-- =============================================================================
-- THREAD 8C SLICE 2 — why action is required, not merely that it is.
--
-- `requires_action` was enough while the only rail was card: it meant 3DS, the operator handed the
-- family back to the bank's challenge, and the words on the screen were the same every time.
--
-- ACH makes the same state mean something else. Raw bank details produce
-- `requires_action → verify_with_microdeposits`, which is not a challenge to complete now — it is a
-- verification that takes days and that Thread 8C deliberately does not implement. Telling an
-- operator "action required" for that is nearly useless, and telling them "processing" or "failed"
-- would be wrong in opposite directions.
--
-- So the attempt records the provider's own next-action type and the surface reads it. Null is the
-- ordinary case: most states require no action at all.
-- =============================================================================

ALTER TABLE public.payment_collection_attempts
    ADD COLUMN IF NOT EXISTS provider_action_type text;

COMMENT ON COLUMN public.payment_collection_attempts.provider_action_type IS
    'Thread 8C: the provider next_action type when one is required, e.g. verify_with_microdeposits. Null when no action is outstanding. Presentation reads it; nothing financial depends on it.';
