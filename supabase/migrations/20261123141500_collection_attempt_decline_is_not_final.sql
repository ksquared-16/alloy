-- =============================================================================
-- A DECLINE IS TERMINAL FOR THE ATTEMPT, NOT FOR THE PROVIDER'S MONEY.
--
-- `enforce_collection_attempt_state_progression` treated `succeeded`, `failed` and `canceled` as one
-- class: once there, never anywhere else. Two of them are final at the provider — a PaymentIntent that
-- succeeded or was canceled never changes again. `failed` is not. Stripe's `payment_intent.payment_failed`
-- leaves the intent in `requires_payment_method`, and the payer's still-open tab can confirm it with a
-- second card.
--
-- When that second card succeeded, the attempt was already `failed`, this trigger refused the move to
-- `succeeded`, the webhook recorded the success as "stale", and the money the provider collected was
-- never posted. The family had paid; Alloy said they had not.
--
-- ── WHAT CHANGES ──
--
-- Exactly one transition is admitted that was not before: `failed → succeeded`, which is provider
-- evidence of collection arriving after a decline. Everything else is unchanged:
--
--   succeeded → anything else     refused   (the provider does not un-succeed)
--   canceled  → anything else     refused
--   failed    → succeeded         ADMITTED  (a later success on the same intent; it must post)
--   failed    → anything else     refused   (a late processing/requires_action is older truth)
--
-- The collection service separately never REUSES a failed attempt: a retry opens a new attempt and
-- retires the declined intent at the provider. This migration is only about not discarding money.
--
-- Re-runnable: CREATE OR REPLACE of the function only; the trigger binding is unchanged.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_collection_attempt_state_progression()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    terminal text[] := ARRAY['succeeded'::text, 'failed'::text, 'canceled'::text];
BEGIN
    IF NEW.processor_state IS NOT DISTINCT FROM OLD.processor_state THEN
        RETURN NEW;
    END IF;

    -- A decline followed by the provider's own success on the same intent is newer truth, not older.
    IF OLD.processor_state = 'failed' AND NEW.processor_state = 'succeeded' THEN
        RETURN NEW;
    END IF;

    IF OLD.processor_state = ANY (terminal) THEN
        RAISE EXCEPTION 'collection attempt % is terminal at % and cannot move to %; provider evidence does not un-succeed',
            OLD.id, OLD.processor_state, NEW.processor_state
            USING ERRCODE = '0A000';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_collection_attempt_state_progression() IS
    'A collection attempt that reached succeeded or canceled stays there; one that failed may only move to succeeded (the provider collected on the same intent after a decline, and that money must post). Re-asserting the same state is harmless (a duplicate delivery); any other move out of a terminal state is refused, so an out-of-order provider event cannot walk collected money backwards.';
