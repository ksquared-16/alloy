-- Additive-only: indexes for existing public.payments table (table created outside migrations).
-- No CREATE TABLE. No CHECK constraints. Aligns with existing schema:
--   payment_status_id uuid FK -> payment_statuses(id), provider text, provider_payment_id text,
--   org_id uuid, posted_to_ledger_at timestamptz, trigger on paid_at for ledger.

CREATE INDEX IF NOT EXISTS payments_job_id_idx ON public.payments (job_id);
CREATE INDEX IF NOT EXISTS payments_customer_id_idx ON public.payments (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_idx ON public.payments (provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON public.payments (paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_payment_status_id_idx ON public.payments (payment_status_id);
CREATE INDEX IF NOT EXISTS payments_org_id_idx ON public.payments (org_id);
