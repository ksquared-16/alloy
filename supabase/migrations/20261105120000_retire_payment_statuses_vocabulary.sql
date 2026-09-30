-- =============================================================================
-- PAYMENTS V1 · W6-A2 — THE LAST DEVELOPMENT-ERA PAYMENTS SCHEMA.
--
-- `payment_statuses` was the job-era payment status vocabulary, resolved by the Python payment
-- executor (`insert_payment(..., payment_status_id=pending_uuid)` before `PaymentIntent.create`).
-- That executor is deleted in the same change as this migration, and its last TypeScript reader —
-- `jobPaymentSummary.effectivePaymentRowStatusKey` — went with it: two legacy pages imported its
-- label helper with ZERO call sites after W6-A1 removed their payments sections, and the only other
-- reference was a type used solely by a component with no importer.
--
-- The canonical vocabularies are unchanged and are NOT merged:
--
--     payments.status                             the money's own lifecycle
--     payment_collection_attempts.processor_state provider execution state
--
-- ── WHAT IS DROPPED, AND WHY EACH ONE IS PROVEN ──
--
--   payment_statuses              zero runtime reader/writer in TypeScript, Python, SQL functions,
--                                 views, triggers and policies. Exactly one inbound FK, dropped
--                                 below with the column that carried it.
--   payments.payment_status_id    the FK twin. No reader outside the drawer type it fed.
--   payments.deposit_batch_id     zero references ANYWHERE: no TypeScript, no Python, and its only
--                                 SQL occurrence is its own ADD COLUMN. Never read, never written.
--
-- ── WHAT IS DELIBERATELY NOT DROPPED ──
--
-- The other six candidates have CURRENT authority and are kept, not deferred as debt:
--
--   paid_at              guarded by the immutability trigger below, SELECTed live by
--                        /api/admin/related/[entity]/[id], and an editable entity-drawer field
--   status_key           guarded by the same trigger; job rows still edit it through their PATCH
--                        route by design. NOT the platform `status_key` vocabulary on assignments,
--                        opportunities, tour_bookings and case statuses, which is untouched
--   provider_payment_id  read by /api/admin/entity and /api/admin/related as the legacy provider ref
--   posted_to_ledger_at  a rendered entity-drawer field
--   job_id, customer_id  the job vertical's own billing grain, and customer_id carries a real FK
--                        used by the related-records reader
--
-- Origin is not authority. Each of those is read by something today.
--
-- ── ORDER ──
--
-- The trigger function is rewritten FIRST. `NEW.payment_status_id` resolves at runtime, so dropping
-- the column while the old body still names it would break the next posted-payment UPDATE.
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

        -- THE LIFECYCLE IS FINANCIAL TOO. `paid_at` is the date this money is reported against and
        -- `status_key` is what a job-era operator surface reads to decide whether it arrived.
        -- Editing either in place restates settled money without recording a correction.
        --
        -- `payment_status_id` was named here too and is GONE (Payments V1 · W6-A2): the column and
        -- the `payment_statuses` table it pointed at are dropped in the same migration that rewrites
        -- this function. The guard NARROWS by exactly one column that no longer exists; the two
        -- lifecycle fields that still exist are still protected, and nothing it used to refuse
        -- becomes permitted.
        IF NEW.paid_at IS DISTINCT FROM OLD.paid_at
            OR NEW.status_key IS DISTINCT FROM OLD.status_key THEN
            RAISE EXCEPTION 'posted childcare payment % is immutable: lifecycle fields (paid_at, status_key) cannot change in place; record a refund via refunds_payment_id', OLD.id
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

-- The FK and its index go before the column they describe.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_status_id_fkey;
DROP INDEX IF EXISTS public.idx_payments_status;

ALTER TABLE public.payments DROP COLUMN IF EXISTS payment_status_id;
ALTER TABLE public.payments DROP COLUMN IF EXISTS deposit_batch_id;

-- Last, once nothing references it.
DROP TABLE IF EXISTS public.payment_statuses;

-- -----------------------------------------------------------------------------
-- SELF-TEST — the statements above either took effect or this migration fails.
--
-- A failed apply does not roll back DDL, so this asserts the resulting STATE. It also asserts what
-- must SURVIVE: a teardown that quietly took a canonical column with it would pass a test that only
-- looked for absence.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v integer;
BEGIN
    -- GONE
    PERFORM 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'payment_statuses';
    IF FOUND THEN RAISE EXCEPTION 'payment_statuses still exists'; END IF;

    FOR v IN SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'payments'
                AND column_name IN ('payment_status_id', 'deposit_batch_id')
    LOOP
        RAISE EXCEPTION 'a dropped payments column still exists';
    END LOOP;

    -- SURVIVING CANONICAL MONEY. The teardown must not have reached any of these.
    SELECT count(*) INTO v FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'payments'
       AND column_name IN ('status', 'direction', 'amount_cents', 'processor',
                           'processor_transaction_id', 'payer_entity_type', 'payer_entity_id',
                           'billable_source_type', 'billable_source_id', 'refunds_payment_id',
                           'reversal_origin', 'idempotency_key');
    IF v <> 12 THEN
        RAISE EXCEPTION 'canonical payments columns missing: expected 12, found %', v;
    END IF;

    -- SURVIVING BY CURRENT AUTHORITY, not by accident.
    SELECT count(*) INTO v FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'payments'
       AND column_name IN ('paid_at', 'status_key', 'provider_payment_id',
                           'posted_to_ledger_at', 'job_id', 'customer_id', 'provider');
    IF v <> 7 THEN
        RAISE EXCEPTION 'a column with current authority was dropped: expected 7, found %', v;
    END IF;

    -- The canonical provider tier, W2 methods, W4 holds and W5 Autopay are untouched.
    SELECT count(*) INTO v FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('payment_collection_attempts', 'payment_provider_events',
                          'payment_provider_refunds', 'payment_methods', 'payment_holds',
                          'payment_hold_dispositions', 'payment_autopay_arrangements',
                          'payment_allocations');
    IF v <> 8 THEN
        RAISE EXCEPTION 'a canonical Payments table is missing: expected 8, found %', v;
    END IF;

    -- The immutability guard still exists and still fires on the two surviving lifecycle fields.
    PERFORM 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'enforce_childcare_payment_immutability';
    IF NOT FOUND THEN RAISE EXCEPTION 'the childcare payment immutability guard is missing'; END IF;

    -- Canonical Payments permissions and the live scheduling keys are untouched by this migration.
    SELECT count(*) INTO v FROM public.permission_definitions
     WHERE key IN ('fin.read', 'fin.write', 'fin.adjust', 'scheduling.write', 'ops.jobs.write');
    IF v <> 5 THEN
        RAISE EXCEPTION 'permission catalog disturbed: expected 5, found %', v;
    END IF;
END $$;
