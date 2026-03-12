-- Pass 1 booking lifecycle: allow opportunity to exist at quote stage without a customer.
-- Customer is created at payment/confirm, not at quote-start.
ALTER TABLE public.opportunities
  ALTER COLUMN customer_id DROP NOT NULL;

COMMENT ON COLUMN public.opportunities.customer_id IS 'Set at booking/confirm; null during quote stage.';
