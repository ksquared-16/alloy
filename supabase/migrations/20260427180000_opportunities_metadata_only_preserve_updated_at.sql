-- When only `metadata` changes on opportunities, keep `updated_at` unchanged so dev seeds
-- (and similar metadata-only patches) do not erase intentional stale timestamps for queues.

CREATE OR REPLACE FUNCTION public.set_updated_at_opportunities()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    new_wo jsonb;
    old_wo jsonb;
BEGIN
    new_wo := to_jsonb(NEW) - 'metadata' - 'updated_at';
    old_wo := to_jsonb(OLD) - 'metadata' - 'updated_at';

    IF NEW.metadata IS DISTINCT FROM OLD.metadata AND new_wo IS NOT DISTINCT FROM old_wo THEN
        NEW.updated_at := OLD.updated_at;
        RETURN NEW;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opps_updated_at ON public.opportunities;

CREATE TRIGGER trg_opps_updated_at
    BEFORE UPDATE ON public.opportunities
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_opportunities();
