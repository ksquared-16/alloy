-- =============================================================================
-- THREAD 8B — F1/F2: a posted childcare receipt's LIFECYCLE is as immutable as its amount.
--
-- `20260903190000` froze what a posted childcare payment is worth — amount, currency, direction,
-- source, refund lineage, and the received/posted stamps — and stopped there. It left three fields
-- that decide whether the money COUNTS entirely unguarded:
--
--   * `status_key`          the operator-facing lifecycle key
--   * `payment_status_id`   its FK twin
--   * `paid_at`             the date the money is reported against
--
-- and it blocked a posted receipt from reverting only to `pending` or `failed`.
--
-- ── WHY THIS IS NOT COSMETIC ──
--
-- The authoritative balance counts active applications whose parent payment is `status = 'posted'`.
-- `voided` was never in the blocked list, so a posted childcare receipt could be voided IN PLACE.
-- The row survives, the applications survive, and the money simply stops counting: the family's
-- outstanding silently goes back up, with no refund, no `refunds_payment_id`, and no reversal reason.
-- That is the exact outcome the append-only design exists to make impossible, reached by writing one
-- word into one column.
--
-- It is reachable today. `PATCH /api/admin/payments/[id]` writes `status_key` / `paid_at` on any
-- payment in the org without consulting `childcarePaymentService`, and
-- `paymentAppStatusFromStatusKey` maps `canceled` / `cancelled` / `void` / `voided` onto
-- `status = 'voided'`. A generic route intended for job billing could therefore erase childcare cash.
--
-- ── WHY THE DATABASE AND NOT THE ROUTE ──
--
-- The route is also repaired, but a check that lives only in one handler is a check the next handler
-- does not have. This is the same argument `20260903190000` made for putting the one-active-
-- application rule in an index rather than in a service.
--
-- ── JOB BILLING IS UNTOUCHED ──
--
-- Every rule here stays quantified over CHILDCARE billable sources, exactly as `20260903190000`
-- scoped its own. `job` rows keep editing `status_key` / `paid_at` / `notes` through their PATCH
-- route as they always have. That is deliberate: the job vertical owns its own lifecycle, and a rule
-- written against all payments would be the regression P3.1 forbids.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_childcare_payment_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    childcare_sources text[] := ARRAY['enrollment_agreement'::text, 'customer'::text];
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.billable_source_type = ANY (childcare_sources) THEN
            RAISE EXCEPTION 'childcare payment % is immutable: DELETE not allowed; record a refund via refunds_payment_id', OLD.id
                USING ERRCODE = '0A000';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.billable_source_type = ANY (childcare_sources) AND OLD.status = 'posted' THEN
        IF NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
            OR NEW.currency IS DISTINCT FROM OLD.currency
            OR NEW.direction IS DISTINCT FROM OLD.direction
            OR NEW.org_id IS DISTINCT FROM OLD.org_id
            OR NEW.billable_source_type IS DISTINCT FROM OLD.billable_source_type
            OR NEW.billable_source_id IS DISTINCT FROM OLD.billable_source_id
            OR NEW.refunds_payment_id IS DISTINCT FROM OLD.refunds_payment_id
            OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
            OR NEW.received_at IS DISTINCT FROM OLD.received_at
            OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'posted childcare payment % is immutable: financial fields cannot change in place; record a refund via refunds_payment_id', OLD.id
                USING ERRCODE = '0A000';
        END IF;

        -- THE LIFECYCLE IS FINANCIAL TOO. `paid_at` is the date this money is reported against, and
        -- `status_key` / `payment_status_id` are what an operator surface reads to decide whether it
        -- arrived. Editing them in place restates settled money without recording a correction.
        IF NEW.paid_at IS DISTINCT FROM OLD.paid_at
            OR NEW.status_key IS DISTINCT FROM OLD.status_key
            OR NEW.payment_status_id IS DISTINCT FROM OLD.payment_status_id THEN
            RAISE EXCEPTION 'posted childcare payment % is immutable: lifecycle fields (paid_at, status_key, payment_status_id) cannot change in place; record a refund via refunds_payment_id', OLD.id
                USING ERRCODE = '0A000';
        END IF;

        -- Money that arrived does not become money that never arrived. `voided` belongs in this list
        -- for the same reason `pending` and `failed` do, and is the more dangerous of the three:
        -- it is the one a status-key vocabulary reaches by accident.
        IF NEW.status IS DISTINCT FROM OLD.status
            AND NEW.status = ANY (ARRAY['pending'::text, 'failed'::text, 'voided'::text]) THEN
            RAISE EXCEPTION 'posted childcare payment % cannot revert to %; record a refund via refunds_payment_id', OLD.id, NEW.status
                USING ERRCODE = '0A000';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_childcare_payment_immutability() IS
    'Posted childcare payments (billable_source_type in enrollment_agreement | customer) are append-only: financial fields, the receipt stamps and the lifecycle fields (paid_at, status_key, payment_status_id) are frozen, DELETE is refused, and a posted receipt never reverts to pending, failed or voided. Refunds are NEW rows via refunds_payment_id. Job rows are governed by job billing and pass through.';

-- -----------------------------------------------------------------------------
-- MONEY ORDER is a rail, not a processor.
--
-- The canonical model already separates HOW value was tendered (`payment_method`) from WHO executed
-- it (`processor`, `processor_transaction_id`), and already admits card / ach / cash / check /
-- manual / subsidy / other. `money_order` is the one tender in the canonical list with nowhere
-- truthful to go, so it is added here rather than being recorded as `other` and losing its identity.
--
-- Nothing about this admits a processor concept into the rail vocabulary: a money order has no
-- provider transaction, exactly as cash and check have none.
-- -----------------------------------------------------------------------------
ALTER TABLE public.payments
    DROP CONSTRAINT IF EXISTS payments_payment_method_chk;
ALTER TABLE public.payments
    ADD CONSTRAINT payments_payment_method_chk CHECK (
        payment_method = ANY (ARRAY[
            'card'::text,
            'ach'::text,
            'cash'::text,
            'check'::text,
            'money_order'::text,
            'manual'::text,
            'subsidy'::text,
            'other'::text
        ])
    );
