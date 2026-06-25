-- Phase 6: Reject writes to deprecated legacy CRM text status columns.
-- Compatible with demo reset (does not block DELETE or status_key writes).
-- Remove triggers after column drops (20260625140100_canonical_drop_legacy_status_columns.sql).

CREATE OR REPLACE FUNCTION public.reject_legacy_crm_text_status_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status IS NOT NULL THEN
        IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
            RAISE EXCEPTION '%.status text column is deprecated; use status_key', TG_TABLE_NAME
                USING HINT = 'Canonical Data System Phase 6 — legacy status column write guard';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_opportunities_legacy_status_write ON public.opportunities;
CREATE TRIGGER trg_reject_opportunities_legacy_status_write
    BEFORE INSERT OR UPDATE OF status ON public.opportunities
    FOR EACH ROW
    EXECUTE FUNCTION public.reject_legacy_crm_text_status_write();

DROP TRIGGER IF EXISTS trg_reject_persons_legacy_status_write ON public.persons;
CREATE TRIGGER trg_reject_persons_legacy_status_write
    BEFORE INSERT OR UPDATE OF status ON public.persons
    FOR EACH ROW
    EXECUTE FUNCTION public.reject_legacy_crm_text_status_write();

DROP TRIGGER IF EXISTS trg_reject_customers_legacy_status_write ON public.customers;
CREATE TRIGGER trg_reject_customers_legacy_status_write
    BEFORE INSERT OR UPDATE OF status ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.reject_legacy_crm_text_status_write();

COMMENT ON FUNCTION public.reject_legacy_crm_text_status_write() IS
    'Phase 6 canonical guard — blocks legacy text status writes on opportunities/persons/customers. Drop after legacy status columns removed.';
