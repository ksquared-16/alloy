-- =============================================================================
-- PAYMENTS V1 · W4 — HELD DEPOSITS. A restriction over money that already exists.
--
-- RECEIVED MONEY IS NOT AVAILABLE MONEY. A held deposit is already a canonical Payment; what W4 adds
-- is the fact that some of that receipt may not be spent against ordinary obligations yet.
--
--   unapplied = amount − active allocations − refunded      (already canonical)
--   held      = what these tables restrict
--   available = unapplied − held
--
-- ── NO SECOND MONEY SPINE ──
--
-- No deposit payment, no deposit wallet, no deposit balance, no second prepaid store, no second
-- ledger, no second allocation table, no second receipt. `payments` remains the receipt and
-- `payment_allocations` remains the allocation. These two tables say only "this much of that receipt
-- is restricted, and here is what became of it".
--
-- ── WHY TWO TABLES AND NOT A MUTABLE amount_cents ──
--
-- The Director amendment: a hold is an ECONOMIC LOT, and releasing $200 of a $500 hold must not
-- destroy the fact that $500 was held. Decrementing in place would leave $300 and no record that
-- $500 ever existed, so "what did we hold and what happened to it" becomes unanswerable the moment
-- anything partial occurs.
--
-- So the lot is IMMUTABLE and every disposition is an APPEND. The remaining held amount is derived:
--
--   remaining(hold) = hold.amount_cents − sum(dispositions.amount_cents)
--
-- That also means there is no `state` column to drift: a hold is open while something remains and
-- closed when nothing does, which is a function of the rows rather than a flag somebody must
-- remember to set. The architecture packet listed `released_at / released_by / release_reason` on the
-- hold itself; those are per-DISPOSITION facts, and one set of them cannot describe two partial
-- releases — so they live on the disposition, which is the same information without the lie.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_holds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,

    -- The canonical receipt this restricts. RESTRICT, because a payment whose holds still exist has
    -- economic history that must not vanish underneath them.
    payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,

    -- WHAT WAS ORIGINALLY HELD. Immutable — see the header. Never decremented.
    amount_cents bigint NOT NULL CHECK (amount_cents > 0),

    /*
     * THE TERMS UNDER WHICH THIS MONEY WAS HELD, SNAPSHOT AT CREATION.
     *
     * If the organisation's deposit policy changes next year, money already held keeps the terms it
     * was taken under. Resolving refundability from the CURRENT policy would retroactively change
     * what a family was promised, which is the one thing a deposit must not do.
     *
     * `policy_id` is provenance — which policy this came from — and is deliberately NOT the thing
     * consulted at refund time. The snapshot governs.
     */
    refundable boolean NOT NULL,
    refundable_terms jsonb NOT NULL DEFAULT '{}'::jsonb,
    policy_id uuid,

    reason text,
    held_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid
);

COMMENT ON TABLE public.payment_holds IS
    'An immutable economic lot restricting part of a canonical Payment. Not money of its own: the receipt is in payments. The remaining held amount is amount_cents minus its dispositions, never a decremented column.';

CREATE TABLE IF NOT EXISTS public.payment_hold_dispositions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,
    hold_id uuid NOT NULL REFERENCES public.payment_holds (id) ON DELETE RESTRICT,

    /*
     * WHAT THE MONEY BECAME. Three things can happen to held money and they are not the same event:
     *
     *   released   it stopped being restricted and became ordinary available prepaid money
     *   applied    it settled an obligation, through the ORDINARY allocation authority
     *   refunded   it went back to the payer, through the ORDINARY refund authority
     *
     * None of them is "the hold shrank". The hold did not shrink; some of it was disposed of.
     */
    kind text NOT NULL CHECK (kind IN ('released', 'applied', 'refunded')),
    amount_cents bigint NOT NULL CHECK (amount_cents > 0),

    -- Provenance INTO the canonical world, so a disposition can be tied to what it produced.
    -- `applied` names an ordinary payment_allocation; `refunded` names an ordinary outbound payment.
    allocation_id uuid REFERENCES public.payment_allocations (id) ON DELETE RESTRICT,
    refund_payment_id uuid REFERENCES public.payments (id) ON DELETE RESTRICT,

    reason text,
    disposed_at timestamptz NOT NULL DEFAULT now(),
    disposed_by uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    -- An applied disposition without its allocation, or a refunded one without its refund, would be
    -- a claim with no canonical counterpart.
    CONSTRAINT payment_hold_dispositions_applied_names_allocation_chk
        CHECK (kind <> 'applied' OR allocation_id IS NOT NULL),
    CONSTRAINT payment_hold_dispositions_refunded_names_payment_chk
        CHECK (kind <> 'refunded' OR refund_payment_id IS NOT NULL),
    -- A release produces neither; naming one would invent a consequence that did not happen.
    CONSTRAINT payment_hold_dispositions_release_is_bare_chk
        CHECK (kind <> 'released' OR (allocation_id IS NULL AND refund_payment_id IS NULL))
);

COMMENT ON TABLE public.payment_hold_dispositions IS
    'Append-only record of what became of held money: released, applied or refunded. Never updated, never deleted — the history of a hold is the sum of these rows.';

CREATE INDEX IF NOT EXISTS idx_payment_holds_payment ON public.payment_holds (org_id, payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_hold_dispositions_hold ON public.payment_hold_dispositions (hold_id);

-- -----------------------------------------------------------------------------
-- INVARIANT 1 — A HOLD CANNOT BE DISPOSED OF BEYOND WHAT IT HELD.
--
-- Releasing $600 of a $500 hold is not an unusual case to handle gracefully; it is money appearing
-- from nowhere. A service check cannot enforce it, because two concurrent dispositions both read
-- the same remaining amount and both pass. The lot row is locked, so they serialise.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_payment_hold_disposition_bounds()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_held bigint;
    v_disposed bigint;
BEGIN
    -- FOR UPDATE: this is what makes two simultaneous dispositions take turns instead of racing.
    SELECT amount_cents INTO v_held
    FROM public.payment_holds
    WHERE id = NEW.hold_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'hold % does not exist', NEW.hold_id USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT coalesce(sum(amount_cents), 0) INTO v_disposed
    FROM public.payment_hold_dispositions
    WHERE hold_id = NEW.hold_id
      AND id IS DISTINCT FROM NEW.id;

    IF v_disposed + NEW.amount_cents > v_held THEN
        RAISE EXCEPTION
            'disposing % would exceed hold % — % held, % already disposed of',
            NEW.amount_cents, NEW.hold_id, v_held, v_disposed
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_payment_hold_disposition_bounds ON public.payment_hold_dispositions;
CREATE TRIGGER trg_enforce_payment_hold_disposition_bounds
    BEFORE INSERT ON public.payment_hold_dispositions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_hold_disposition_bounds();

-- -----------------------------------------------------------------------------
-- INVARIANT 2 — A DOLLAR CANNOT BE ALLOCATED AND HELD AND REFUNDED AT ONCE.
--
-- The canonical equation is `unapplied = amount − active allocations − refunded`, and holds restrict
-- part of THAT. So the sum of currently-held money on a payment may never exceed its unapplied
-- remainder. Enforced on the hold insert, against the same three quantities the application reader
-- uses, with the PAYMENT row locked so a concurrent hold and a concurrent application cannot both
-- spend the same cent.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_payment_hold_within_unapplied()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_amount bigint;
    v_allocated bigint;
    v_refunded bigint;
    v_held bigint;
    v_unapplied bigint;
BEGIN
    SELECT amount_cents INTO v_amount
    FROM public.payments
    WHERE id = NEW.payment_id AND org_id = NEW.org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'payment % is not in organization %', NEW.payment_id, NEW.org_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT coalesce(sum(allocated_amount_cents), 0) INTO v_allocated
    FROM public.payment_allocations
    WHERE org_id = NEW.org_id AND payment_id = NEW.payment_id AND status = 'active';

    -- Same predicate as readPaymentRefundedCents: an outbound row naming this receipt, not voided.
    SELECT coalesce(sum(amount_cents), 0) INTO v_refunded
    FROM public.payments
    WHERE org_id = NEW.org_id AND refunds_payment_id = NEW.payment_id AND status <> 'voided';

    SELECT coalesce(sum(h.amount_cents), 0) - coalesce((
        SELECT sum(d.amount_cents)
        FROM public.payment_hold_dispositions d
        JOIN public.payment_holds hh ON hh.id = d.hold_id
        WHERE hh.payment_id = NEW.payment_id AND hh.org_id = NEW.org_id
    ), 0)
    INTO v_held
    FROM public.payment_holds h
    WHERE h.payment_id = NEW.payment_id AND h.org_id = NEW.org_id AND h.id IS DISTINCT FROM NEW.id;

    v_unapplied := v_amount - v_allocated - v_refunded;

    IF v_held + NEW.amount_cents > v_unapplied THEN
        RAISE EXCEPTION
            'holding % would exceed the unapplied money on payment % — % unapplied, % already held',
            NEW.amount_cents, NEW.payment_id, v_unapplied, v_held
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_payment_hold_within_unapplied ON public.payment_holds;
CREATE TRIGGER trg_enforce_payment_hold_within_unapplied
    BEFORE INSERT ON public.payment_holds
    FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_hold_within_unapplied();

-- -----------------------------------------------------------------------------
-- THE LOT IS IMMUTABLE, AND THE DISPOSITIONS ARE APPEND-ONLY.
--
-- This is the amendment expressed where it cannot be forgotten. Without it, the next person to need
-- "just decrement the hold" will do exactly that, and the history the amendment exists to protect
-- disappears silently.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_payment_hold_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
        OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
        OR NEW.org_id IS DISTINCT FROM OLD.org_id
        OR NEW.refundable IS DISTINCT FROM OLD.refundable
        OR NEW.refundable_terms IS DISTINCT FROM OLD.refundable_terms
        OR NEW.held_at IS DISTINCT FROM OLD.held_at THEN
        RAISE EXCEPTION
            'hold % is an economic lot: its amount, payment, org and snapshot terms never change — record a disposition instead', OLD.id
            USING ERRCODE = '0A000';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_payment_hold_immutability ON public.payment_holds;
CREATE TRIGGER trg_enforce_payment_hold_immutability
    BEFORE UPDATE ON public.payment_holds
    FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_hold_immutability();

CREATE OR REPLACE FUNCTION public.refuse_payment_hold_disposition_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'hold dispositions are append-only: % on payment_hold_dispositions is refused', TG_OP
        USING ERRCODE = '0A000';
END;
$function$;

DROP TRIGGER IF EXISTS trg_refuse_payment_hold_disposition_rewrite ON public.payment_hold_dispositions;
CREATE TRIGGER trg_refuse_payment_hold_disposition_rewrite
    BEFORE UPDATE OR DELETE ON public.payment_hold_dispositions
    FOR EACH ROW EXECUTE FUNCTION public.refuse_payment_hold_disposition_rewrite();

-- -----------------------------------------------------------------------------
-- RLS — the same shape as the rest of the childcare money gate.
-- Holding and releasing are `fin.adjust` acts at the authority layer; this is defence in depth.
-- -----------------------------------------------------------------------------
ALTER TABLE public.payment_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_holds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_hold_dispositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_hold_dispositions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_holds_same_org ON public.payment_holds;
CREATE POLICY payment_holds_same_org ON public.payment_holds
    FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS payment_holds_write_rolegate ON public.payment_holds;
CREATE POLICY payment_holds_write_rolegate ON public.payment_holds
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS payment_hold_dispositions_same_org ON public.payment_hold_dispositions;
CREATE POLICY payment_hold_dispositions_same_org ON public.payment_hold_dispositions
    FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS payment_hold_dispositions_write_rolegate ON public.payment_hold_dispositions;
CREATE POLICY payment_hold_dispositions_write_rolegate ON public.payment_hold_dispositions
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

-- -----------------------------------------------------------------------------
-- SELF-TEST — shape, not assumption. A failed apply does not roll back DDL.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_missing text;
BEGIN
    IF to_regclass('public.payment_holds') IS NULL THEN
        RAISE EXCEPTION 'payment_holds was not created';
    END IF;
    IF to_regclass('public.payment_hold_dispositions') IS NULL THEN
        RAISE EXCEPTION 'payment_hold_dispositions was not created';
    END IF;

    SELECT string_agg(needed, ', ') INTO v_missing
    FROM (VALUES
        ('trg_enforce_payment_hold_disposition_bounds'),
        ('trg_enforce_payment_hold_within_unapplied'),
        ('trg_enforce_payment_hold_immutability'),
        ('trg_refuse_payment_hold_disposition_rewrite')
    ) AS t(needed)
    WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = needed AND NOT tgisinternal);
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'held-money invariants are not enforced: missing %', v_missing;
    END IF;

    -- W1–W3 must be untouched by this migration.
    IF to_regclass('public.payments') IS NULL
        OR to_regclass('public.payment_allocations') IS NULL
        OR to_regclass('public.payment_methods') IS NULL
        OR to_regclass('public.payment_collection_attempts') IS NULL THEN
        RAISE EXCEPTION 'a prior payments table is missing; W4 must not disturb W1-W3';
    END IF;

    RAISE NOTICE 'payment_holds + payment_hold_dispositions present, 4 invariant triggers attached, W1-W3 intact';
END $$;
