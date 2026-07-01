-- Phase 6: Drop deprecated legacy CRM text status columns.
-- Prerequisites: status_key backfill verified; write guards applied (20260625140000).
-- Rollback: re-add text columns and backfill from status_key if needed:
--   ALTER TABLE opportunities ADD COLUMN status text;
--   UPDATE opportunities SET status = status_key WHERE status IS NULL AND status_key IS NOT NULL;

DROP TRIGGER IF EXISTS trg_reject_opportunities_legacy_status_write ON public.opportunities;
DROP TRIGGER IF EXISTS trg_reject_persons_legacy_status_write ON public.persons;
DROP TRIGGER IF EXISTS trg_reject_customers_legacy_status_write ON public.customers;

ALTER TABLE public.opportunities DROP COLUMN IF EXISTS status;
ALTER TABLE public.persons DROP COLUMN IF EXISTS status;
ALTER TABLE public.customers DROP COLUMN IF EXISTS status;

-- Guard function no longer needed after column drop.
DROP FUNCTION IF EXISTS public.reject_legacy_crm_text_status_write();
