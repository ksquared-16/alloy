-- =============================================================================
-- PAYMENT APPLICATION — childcare money received, applied ONCE, and refundable
-- without rewriting history.
--
-- WHAT THE CENSUS ACTUALLY FOUND (certification/financials/payments-spine-census.sql,
-- tha_be923375ea3595, deployed primary, 2026-09-03):
--
--   * `payments.job_id` is NULLABLE. Thread 1's readout said NOT NULL and planned around it;
--     `20260329210000` dropped that NOT NULL five months ago and the deployed database agrees.
--     A childcare payment was never unrepresentable for the reason we were told.
--   * `payment_allocations.charge_id` EXISTS and is nullable. The charge-level application seam
--     is already here, and `charges` is already generalized to `billable_source_*` by P3.1. So a
--     payment applied to a childcare charge needs NO new table and NO new balance rule:
--     `jobPaymentBalances` already computes owed as (charges − active allocations on POSTED
--     payments), and that arithmetic is source-agnostic.
--   * `billable_source_type` / `billable_source_id` are ABSENT from `payments`. P3.1 generalized
--     `charges`, `ledger_transactions` and `gl_journal_lines` and skipped this one table. THAT is
--     the real structural gap, and it matters for a reason naming does not convey: without the
--     dimension there is no way to say "this is childcare money" — so every childcare guarantee
--     would have to be written against ALL payments and would regress job billing, which is the one
--     thing P3.1 forbids.
--   * There is NO unique index on either money table except the two primary keys. Nothing anywhere
--     stops a retried request or a replayed provider event from writing the same money twice.
--   * 0 payments, 0 allocations, 2 posted childcare charges. Nothing to backfill, and no existing
--     row can conflict with a uniqueness rule added here.
--
-- WHAT THIS DOES NOT DO. No second payments table, no childcare payment ledger, no second balance
-- calculation, no duplicate allocation model, no new provider abstraction, no parallel Stripe path.
-- Every rule below is either the generic dimension P3.1 already established, or a guarantee Thread 1
-- already stated for charges, extended to the table that receives the money.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The generic billable-source dimension P3.1 gave every other money table.
--
-- For a childcare payment the source is the ACCOUNT the money was received against — the household
-- (`customer`) or the agreement (`enrollment_agreement`) — which is the same identity space
-- `charges.billable_source_id` uses. `payments.customer_id` is NOT a second answer to this: it is
-- the legacy job-billing column, and for a childcare payment it is set to the same household id so
-- existing job-era readers keep working.
--
-- `job` rows carry it too, backfilled from `job_id`, exactly as P3.1 backfilled `charges`.
-- -----------------------------------------------------------------------------
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS billable_source_type text,
    ADD COLUMN IF NOT EXISTS billable_source_id uuid;

UPDATE public.payments
    SET billable_source_type = 'job', billable_source_id = job_id
    WHERE billable_source_type IS NULL AND job_id IS NOT NULL;

ALTER TABLE public.payments
    DROP CONSTRAINT IF EXISTS payments_billable_source_type_chk;
ALTER TABLE public.payments
    ADD CONSTRAINT payments_billable_source_type_chk CHECK (
        billable_source_type IS NULL OR billable_source_type = ANY (ARRAY[
            'job'::text,
            'enrollment_agreement'::text,
            'customer'::text
        ])
    );

-- The pair is whole or absent. A type with no id names nothing.
ALTER TABLE public.payments
    DROP CONSTRAINT IF EXISTS payments_billable_source_pair_chk;
ALTER TABLE public.payments
    ADD CONSTRAINT payments_billable_source_pair_chk CHECK (
        (billable_source_type IS NULL AND billable_source_id IS NULL)
        OR (billable_source_type IS NOT NULL AND billable_source_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_payments_org_billable_source_partial
    ON public.payments USING btree (org_id, billable_source_type, billable_source_id)
    WHERE billable_source_type IS NOT NULL;

COMMENT ON COLUMN public.payments.billable_source_type IS
    'Polymorphic billable source kind: job | enrollment_agreement | customer. The same dimension P3.1 put on charges / ledger_transactions / gl_journal_lines and skipped here. It is what lets a childcare guarantee be scoped to childcare money instead of regressing job billing.';
COMMENT ON COLUMN public.payments.billable_source_id IS
    'Polymorphic billable source id. For job rows equals job_id; for childcare it is the household (customers.id) or the agreement the money was received against.';

-- -----------------------------------------------------------------------------
-- 2. IDEMPOTENCY. A retried request and a replayed provider event are the two ways one payment
--    becomes two, and the census found nothing standing between either of them and the money.
--
-- A service-side "have I seen this key?" check races with itself; a UNIQUE INDEX does not. This is
-- the same shape as `uq_charges_one_live_reversal_per_source`: the rule lives where concurrency is
-- actually resolved, and the friendly message lives in the service.
--
-- Both indexes are partial on NOT NULL, so a job payment that supplies neither key is unaffected.
-- -----------------------------------------------------------------------------
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS idempotency_key text;

COMMENT ON COLUMN public.payments.idempotency_key IS
    'Caller-supplied de-duplication key, unique per org. A retried record-payment request carrying the same key returns the payment that already exists instead of writing a second one.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_org_idempotency_key
    ON public.payments (org_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- A provider transaction is one payment. `payments_provider_payment_id_ux` was dropped by
-- `20260329210000` when the column was renamed forward, and nothing replaced it, so a duplicate
-- webhook or a re-confirmed PaymentIntent could land twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_org_processor_transaction
    ON public.payments (org_id, processor, processor_transaction_id)
    WHERE processor_transaction_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. REFUND LINEAGE. A refund is a NEW row that points at the payment it refunds — the same
--    append-only shape `charges.source_charge_id` gives a correction. The original payment is never
--    edited, never deleted, and keeps reading exactly as it was received.
--
-- `direction` already distinguishes inbound from outbound and needs no new vocabulary.
-- -----------------------------------------------------------------------------
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS refunds_payment_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_refunds_payment_id_fkey') THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT payments_refunds_payment_id_fkey
            FOREIGN KEY (refunds_payment_id) REFERENCES public.payments (id) ON DELETE RESTRICT;
    END IF;
END $$;

-- A refund is outbound; an inbound receipt refunds nothing.
ALTER TABLE public.payments
    DROP CONSTRAINT IF EXISTS payments_refund_direction_chk;
ALTER TABLE public.payments
    ADD CONSTRAINT payments_refund_direction_chk CHECK (
        refunds_payment_id IS NULL OR direction = 'outbound'
    );

CREATE INDEX IF NOT EXISTS idx_payments_refunds_payment_id_partial
    ON public.payments USING btree (refunds_payment_id)
    WHERE refunds_payment_id IS NOT NULL;

COMMENT ON COLUMN public.payments.refunds_payment_id IS
    'The inbound payment this outbound row refunds. Corrections are new rows, never edits: the original receipt stays exactly as received and the refund stands beside it.';

-- -----------------------------------------------------------------------------
-- 4. A REFUND CANNOT EXCEED WHAT WAS RECEIVED, and refunds a refund.
--
-- Partial refunds are legitimate and repeatable, so the bound is arithmetic rather than "one of
-- them" — this is where it differs from charge reversal, which is bounded at one. The source row is
-- locked before its siblings are summed, so two concurrent refunds cannot each see the same
-- remaining amount.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_payment_refund_bounds()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    source_amount bigint;
    source_refunds_payment_id uuid;
    source_org uuid;
    already_refunded bigint;
BEGIN
    IF NEW.refunds_payment_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- FOR UPDATE: the sum below is only meaningful if no concurrent refund of the same payment can
    -- be computing it at the same time.
    SELECT p.amount_cents, p.refunds_payment_id, p.org_id
      INTO source_amount, source_refunds_payment_id, source_org
      FROM public.payments p
     WHERE p.id = NEW.refunds_payment_id
     FOR UPDATE;

    IF source_amount IS NULL THEN
        RAISE EXCEPTION 'refund references payment % which does not exist', NEW.refunds_payment_id
            USING ERRCODE = '23503';
    END IF;

    IF source_org IS DISTINCT FROM NEW.org_id THEN
        RAISE EXCEPTION 'refund and the payment it refunds belong to different organizations'
            USING ERRCODE = '42501';
    END IF;

    -- A refund is recorded against the RECEIPT. Refunding a refund pays the family money they never
    -- sent, and starts a chain with no terminus.
    IF source_refunds_payment_id IS NOT NULL THEN
        RAISE EXCEPTION 'payment % is itself a refund and cannot be refunded; record the refund against the original receipt %',
            NEW.refunds_payment_id, source_refunds_payment_id
            USING ERRCODE = '0A000';
    END IF;

    SELECT COALESCE(sum(p.amount_cents), 0)
      INTO already_refunded
      FROM public.payments p
     WHERE p.refunds_payment_id = NEW.refunds_payment_id
       AND p.id IS DISTINCT FROM NEW.id
       AND p.status <> 'voided';

    IF already_refunded + NEW.amount_cents > source_amount THEN
        RAISE EXCEPTION 'refunding % cents of payment % would exceed the % cents received (% already refunded)',
            NEW.amount_cents, NEW.refunds_payment_id, source_amount, already_refunded
            USING ERRCODE = '0A000';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_payment_refund_bounds() IS
    'Refunds sum to at most the payment they refund, belong to the same org, and are recorded against a receipt rather than against another refund. The source row is locked so two concurrent refunds cannot both see the same remaining amount.';

DROP TRIGGER IF EXISTS trg_enforce_payment_refund_bounds ON public.payments;
CREATE TRIGGER trg_enforce_payment_refund_bounds
    BEFORE INSERT OR UPDATE OF refunds_payment_id, amount_cents ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_refund_bounds();

-- -----------------------------------------------------------------------------
-- 5. APPLIED EXACTLY ONCE. One payment applies to one charge at most once while it stands.
--
-- Without this, a retried apply writes a SECOND active allocation against the same charge and the
-- balance drops twice for money that arrived once — the precise failure the mission names. The
-- predicate is `status = 'active'` so a reversed allocation does not block a later re-application,
-- which is what makes a refund followed by a corrected re-application possible at all.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_allocations_one_active_per_payment_charge
    ON public.payment_allocations (payment_id, charge_id)
    WHERE charge_id IS NOT NULL AND status = 'active';

COMMENT ON INDEX public.uq_payment_allocations_one_active_per_payment_charge IS
    'A payment applies to a charge at most once while the application stands. A retried apply must not reduce the balance twice for money that arrived once; a service-side check races with itself and this does not. Reversed allocations are outside the predicate, so a corrected re-application is still possible.';

-- -----------------------------------------------------------------------------
-- 6. NEITHER SIDE OF AN APPLICATION MAY BE OVER-SPENT.
--
-- Two distinct ceilings, both previously enforced only in Python, and only for the job path:
--
--   * a payment cannot be applied for more than it is worth, and
--   * a charge cannot receive more than it asks for.
--
-- Both are computed over ACTIVE allocations whose parent payment is POSTED — the same predicate
-- `jobPaymentBalances` uses to compute what is owed, quoted here so the guard and the balance can
-- never disagree about which rows are money.
--
-- The parent payment and the target charge are locked before their siblings are summed. Without
-- those locks two concurrent applications each see the old total and both pass.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_payment_allocation_bounds()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    payment_amount bigint;
    payment_org uuid;
    payment_status text;
    charge_amount bigint;
    charge_org uuid;
    charge_status text;
    other_allocated bigint;
BEGIN
    -- Only ACTIVE allocations carry financial weight. Reversing one is always allowed.
    IF NEW.status <> 'active' THEN
        RETURN NEW;
    END IF;

    SELECT p.amount_cents, p.org_id, p.status
      INTO payment_amount, payment_org, payment_status
      FROM public.payments p
     WHERE p.id = NEW.payment_id
     FOR UPDATE;

    IF payment_amount IS NULL THEN
        RAISE EXCEPTION 'allocation references payment % which does not exist', NEW.payment_id
            USING ERRCODE = '23503';
    END IF;

    IF payment_org IS DISTINCT FROM NEW.org_id THEN
        RAISE EXCEPTION 'allocation and its payment belong to different organizations'
            USING ERRCODE = '42501';
    END IF;

    -- CEILING 1 — the payment. Every active allocation of this payment, to any target.
    SELECT COALESCE(sum(a.allocated_amount_cents), 0)
      INTO other_allocated
      FROM public.payment_allocations a
     WHERE a.payment_id = NEW.payment_id
       AND a.status = 'active'
       AND a.id IS DISTINCT FROM NEW.id;

    IF other_allocated + NEW.allocated_amount_cents > payment_amount THEN
        RAISE EXCEPTION 'applying % cents would over-apply payment %: % of % cents is already applied',
            NEW.allocated_amount_cents, NEW.payment_id, other_allocated, payment_amount
            USING ERRCODE = '0A000';
    END IF;

    -- CEILING 2 — the charge. Only meaningful for a charge-targeted application; a legacy
    -- job-targeted row with no `charge_id` names no charge to bound.
    IF NEW.charge_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT c.amount_cents, c.org_id, c.status
      INTO charge_amount, charge_org, charge_status
      FROM public.charges c
     WHERE c.id = NEW.charge_id
     FOR UPDATE;

    IF charge_amount IS NULL THEN
        RAISE EXCEPTION 'allocation references charge % which does not exist', NEW.charge_id
            USING ERRCODE = '23503';
    END IF;

    IF charge_org IS DISTINCT FROM NEW.org_id THEN
        RAISE EXCEPTION 'allocation and its charge belong to different organizations'
            USING ERRCODE = '42501';
    END IF;

    -- MONEY IS APPLIED TO AN OBLIGATION THAT EXISTS. A draft is not owed yet and a void charge never
    -- was; paying either reduces a balance that was never stated.
    IF charge_status = 'draft' OR charge_status = 'void' THEN
        RAISE EXCEPTION 'charge % is % and cannot receive a payment; post it first', NEW.charge_id, charge_status
            USING ERRCODE = '0A000';
    END IF;

    -- A credit or reversal row carries a negative amount and is not something a family pays.
    IF charge_amount <= 0 THEN
        RAISE EXCEPTION 'charge % carries a non-positive amount and cannot receive a payment', NEW.charge_id
            USING ERRCODE = '0A000';
    END IF;

    SELECT COALESCE(sum(a.allocated_amount_cents), 0)
      INTO other_allocated
      FROM public.payment_allocations a
      JOIN public.payments p ON p.id = a.payment_id
     WHERE a.charge_id = NEW.charge_id
       AND a.status = 'active'
       AND p.status = 'posted'
       AND a.id IS DISTINCT FROM NEW.id;

    IF other_allocated + NEW.allocated_amount_cents > charge_amount THEN
        RAISE EXCEPTION 'applying % cents would over-pay charge %: % of % cents is already paid',
            NEW.allocated_amount_cents, NEW.charge_id, other_allocated, charge_amount
            USING ERRCODE = '0A000';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_payment_allocation_bounds() IS
    'An active application may not exceed what the payment is worth, nor what the charge still asks for, and never targets a draft, void or non-positive charge. Ceilings are computed over active allocations on POSTED payments — the same predicate the balance read uses — with the payment and charge locked so concurrent applications cannot both pass.';

DROP TRIGGER IF EXISTS trg_enforce_payment_allocation_bounds ON public.payment_allocations;
CREATE TRIGGER trg_enforce_payment_allocation_bounds
    BEFORE INSERT OR UPDATE OF allocated_amount_cents, status, charge_id, payment_id ON public.payment_allocations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_allocation_bounds();

-- -----------------------------------------------------------------------------
-- 7. POSTED CHILDCARE MONEY IS APPEND-ONLY, and an application is never deleted.
--
-- Parity with `enforce_childcare_charge_immutability`. Scoped to the CHILDCARE billable sources for
-- the same reason Thread 1 scoped its rules that way: `job` billing owns its own lifecycle, its
-- PATCH route edits `status_key` / `paid_at` / `notes` on live rows, and a rule written against all
-- payments would break it. That is the job-vertical regression P3.1 forbids.
-- -----------------------------------------------------------------------------
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
        -- Money that arrived does not become money that never arrived.
        IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = ANY (ARRAY['pending'::text, 'failed'::text]) THEN
            RAISE EXCEPTION 'posted childcare payment % cannot revert to %; record a refund via refunds_payment_id', OLD.id, NEW.status
                USING ERRCODE = '0A000';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_childcare_payment_immutability() IS
    'Posted childcare payments (billable_source_type in enrollment_agreement | customer) are append-only: financial fields and the receipt stamps are frozen, DELETE is refused, and a posted receipt never reverts to pending or failed. Refunds are NEW rows via refunds_payment_id. Job rows are governed by job billing and pass through.';

DROP TRIGGER IF EXISTS trg_enforce_childcare_payment_immutability ON public.payments;
CREATE TRIGGER trg_enforce_childcare_payment_immutability
    BEFORE UPDATE OR DELETE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_childcare_payment_immutability();

-- An application is reversed, never deleted. Deleting one erases the fact that money was applied.
CREATE OR REPLACE FUNCTION public.enforce_payment_allocation_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'payment application % is not deletable; set status = reversed with a reversal_reason', OLD.id
        USING ERRCODE = '0A000';
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_payment_allocation_no_delete ON public.payment_allocations;
CREATE TRIGGER trg_enforce_payment_allocation_no_delete
    BEFORE DELETE ON public.payment_allocations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_allocation_no_delete();

-- -----------------------------------------------------------------------------
-- 8. THE CHILDCARE WRITE ROLE GATE, extended to the tables that receive the money.
--
-- `20260902130000` put a RESTRICTIVE gate on `charges`, `ledger_transactions` and `gl_journal_lines`
-- so a childcare money row is not writable by any authenticated member of the org. `payments` and
-- `payment_allocations` still carry only the same-org policies from `20260329210000`, so the money
-- ARRIVING was less protected than the money owed.
--
-- Identical shape to Thread 1's: RESTRICTIVE, `authenticated` only, `service_role` untargeted so
-- server-side writes are unaffected. `payment_allocations` has no `billable_source_type`, so its
-- gate resolves the source through the parent payment — the allocation's childcare-ness is the
-- payment's, and duplicating the column would be a second answer to one question.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS payments_childcare_write_rolegate ON public.payments;
CREATE POLICY payments_childcare_write_rolegate ON public.payments
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (
        billable_source_type IS NULL
        OR billable_source_type <> ALL (ARRAY['enrollment_agreement'::text, 'customer'::text])
        OR public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
    WITH CHECK (
        billable_source_type IS NULL
        OR billable_source_type <> ALL (ARRAY['enrollment_agreement'::text, 'customer'::text])
        OR public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    );

DROP POLICY IF EXISTS payment_allocations_childcare_write_rolegate ON public.payment_allocations;
CREATE POLICY payment_allocations_childcare_write_rolegate ON public.payment_allocations
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (
        NOT EXISTS (
            SELECT 1 FROM public.payments p
             WHERE p.id = payment_allocations.payment_id
               AND p.billable_source_type = ANY (ARRAY['enrollment_agreement'::text, 'customer'::text])
        )
        OR public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
    WITH CHECK (
        NOT EXISTS (
            SELECT 1 FROM public.payments p
             WHERE p.id = payment_allocations.payment_id
               AND p.billable_source_type = ANY (ARRAY['enrollment_agreement'::text, 'customer'::text])
        )
        OR public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    );

COMMENT ON TABLE public.payment_allocations IS
    'Application of payment amounts to polymorphic targets, and — since 20260331120000 — to a charge via charge_id. For outstanding balance count only rows with status = active whose parent payment has status = posted; pending payments may have applications but they do not reduce a balance until the payment posts. An application is reversed, never deleted.';
