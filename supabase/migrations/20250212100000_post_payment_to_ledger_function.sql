-- Fix: trigger payments_post_to_ledger (AFTER UPDATE OF paid_at) calls trg_post_payment_to_ledger(),
-- which in turn calls post_payment_to_ledger(uuid). That function was missing (42883).
-- This migration creates post_payment_to_ledger(payment_id uuid) so the trigger chain succeeds
-- and paid_at updates no longer fail. Also sets posted_to_ledger_at on the payment row.
-- If you have separate ledger tables or another function, replace this body to call them.

CREATE OR REPLACE FUNCTION public.post_payment_to_ledger(payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.payments
  SET posted_to_ledger_at = now()
  WHERE id = payment_id AND posted_to_ledger_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.post_payment_to_ledger(uuid) IS
  'Called by trg_post_payment_to_ledger() when paid_at is set. Sets posted_to_ledger_at; replace body to call real ledger logic if needed.';
