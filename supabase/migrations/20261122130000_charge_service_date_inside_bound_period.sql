-- =============================================================================
-- W7-F009 — A BOUND CHARGE'S SERVICE DATE STAYS INSIDE ITS OWN BILLING PERIOD.
--
-- Since #1405 every writer binds a charge to the billing period containing its SERVICE
-- date, and stores that same date. Four staging charges written on 2026-10-02 by the
-- retired invoice-date binding sit in a period that does not contain their service date;
-- they are history and are not rewritten (posted rows are immutable, and binding is
-- immutable by `enforce_charge_billing_period_immutability`).
--
-- What remained open was a write that RE-DATES a bound draft: binding cannot change, so a
-- recalculation or the consumption-correction RPC that moves `service_date` / `occurs_on`
-- leaves the charge in a period that no longer contains it. This refuses that write, and
-- any new row bound to a period that does not contain its own dates — for every writer,
-- TypeScript or SQL, present or future.
--
-- Only a CHANGE is judged on UPDATE, so the historical rows are untouched by unrelated
-- updates. Null dates and unbound (legacy) rows are outside the rule. Re-runnable.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_charge_dates_inside_bound_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
    v_starts date;
    v_ends date;
BEGIN
    IF NEW.billing_period_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
        AND NEW.billing_period_id IS NOT DISTINCT FROM OLD.billing_period_id
        AND NEW.service_date IS NOT DISTINCT FROM OLD.service_date
        AND NEW.occurs_on IS NOT DISTINCT FROM OLD.occurs_on THEN
        RETURN NEW;
    END IF;

    SELECT bp.starts_on, bp.ends_on INTO v_starts, v_ends
      FROM public.financial_billing_periods bp
     WHERE bp.id = NEW.billing_period_id;
    IF NOT FOUND THEN
        RETURN NEW; -- the foreign key answers a missing period
    END IF;

    IF NEW.service_date IS NOT NULL AND (NEW.service_date < v_starts OR NEW.service_date > v_ends) THEN
        RAISE EXCEPTION 'charge_service_date_outside_period: service date % is outside its billing period % → %', NEW.service_date, v_starts, v_ends
            USING ERRCODE = '23514';
    END IF;
    IF NEW.occurs_on IS NOT NULL AND (NEW.occurs_on < v_starts OR NEW.occurs_on > v_ends) THEN
        RAISE EXCEPTION 'charge_service_date_outside_period: occurrence date % is outside its billing period % → %', NEW.occurs_on, v_starts, v_ends
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_charge_dates_inside_bound_period ON public.charges;
CREATE TRIGGER trg_enforce_charge_dates_inside_bound_period
    BEFORE INSERT OR UPDATE OF service_date, occurs_on, billing_period_id ON public.charges
    FOR EACH ROW EXECUTE FUNCTION public.enforce_charge_dates_inside_bound_period();

COMMENT ON FUNCTION public.enforce_charge_dates_inside_bound_period() IS
    'W7-F009: a bound charge''s service and occurrence dates stay inside its own billing period; only a change is judged on UPDATE.';
