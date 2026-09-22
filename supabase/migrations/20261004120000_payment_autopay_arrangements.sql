-- Payments V1 · W5 — AUTOPAY ARRANGEMENTS: a standing authorization to collect, and nothing more.
--
-- ── WHAT THIS TABLE IS ──
--
-- One row is one PAYER'S STANDING CONSENT for one account: this payer, this payment method, this
-- effective period, this amount policy, this optional ceiling. It is an authorization record, not a
-- schedule and not a balance.
--
-- It deliberately holds NO money figures beyond the authorized ceiling. What is owed is resolved
-- from Financials at execution time, every time. An `amount_to_collect` column here would be a
-- second balance that drifts from the first the moment an operator records a cheque, and the
-- family would be charged for money they had already paid.
--
-- It also holds no due dates. The generic Scheduled Work runtime owns time; this owns consent. The
-- two meet in the registered handler `payments.autopay.evaluate`, which reads a row here and asks
-- Financials what is currently collectible.
--
-- ── WHY A SAVED CARD IS NOT CONSENT ──
--
-- W2 made a payment method storable. Storing an instrument says the family can be charged when they
-- ask to be; it does not say the organisation may charge it unattended. Those are different
-- permissions and this table is the second one, which is why enrollment writes a row here rather
-- than setting a flag on `payment_methods`.
--
-- ── WHY CONSENT IS IMMUTABLE ──
--
-- Changing the payer or the method means a DIFFERENT person authorized a DIFFERENT instrument, and
-- editing the row in place would destroy the record of what was actually agreed and when. The
-- trigger below refuses it: revoke, then authorize anew. What may change is lifecycle (pause,
-- resume, revoke, fail) and the telemetry of attempts — never the terms.

CREATE TABLE IF NOT EXISTS public.payment_autopay_arrangements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,

    -- WHO PAYS. Never who owes: responsibility is Financials' and Autopay never rewrites it.
    -- Generic by column name so a non-person payer can exist later; V1 authorizes people only,
    -- because the payer chooser resolves household persons and nothing else can consent yet.
    payer_entity_type text NOT NULL DEFAULT 'person'
        CHECK (payer_entity_type = 'person'),
    payer_entity_id uuid NOT NULL,

    -- The canonical Alloy method (W2). Never a provider reference, so a browser cannot name a
    -- Stripe PaymentMethod and have it charged unattended.
    payment_method_id uuid NOT NULL REFERENCES public.payment_methods (id) ON DELETE RESTRICT,

    status text NOT NULL DEFAULT 'active'
        CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'revoked'::text, 'failed'::text])),

    -- AUTHORIZATION PROVENANCE. `authorized_by` is the Alloy user who recorded the consent;
    -- `authorization_ref` is what makes it auditable outside Alloy (a mandate id, a signed record).
    authorized_by uuid NOT NULL,
    authorized_at timestamptz NOT NULL DEFAULT now(),
    authorization_ref text,

    effective_from date NOT NULL,
    effective_to date,

    -- V1 IS ONE POLICY ON PURPOSE. Fixed, percentage, installment and custom amounts each need
    -- economics Payments does not own, and a column that accepts them before they exist invites a
    -- row the handler cannot honour.
    amount_policy text NOT NULL DEFAULT 'amount_due'
        CHECK (amount_policy = 'amount_due'),
    max_amount_cents integer
        CHECK (max_amount_cents IS NULL OR max_amount_cents > 0),

    timing_policy text NOT NULL DEFAULT 'on_due_date'
        CHECK (timing_policy = 'on_due_date'),
    timing_offset_days integer NOT NULL DEFAULT 0
        CHECK (timing_offset_days BETWEEN -30 AND 30),

    -- Retry ECONOMICS live in code, not configuration: a tenant cannot widen the ceiling by
    -- editing a row. The column names which policy applies, and V1 has exactly one.
    retry_policy text NOT NULL DEFAULT 'standard_v1'
        CHECK (retry_policy = 'standard_v1'),
    failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    last_attempt_at timestamptz,
    last_failure_reason text,

    revoked_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_autopay_effective_window
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    -- Revocation is a fact with a time, and a status without one cannot be audited.
    CONSTRAINT chk_autopay_revoked_at_matches_status
        CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

COMMENT ON TABLE public.payment_autopay_arrangements IS
    'A payer''s standing authorization to collect what is owed on one account. Holds consent, not '
    'a balance and not a schedule: the amount is resolved from Financials at execution time and the '
    'timing is owned by the generic Scheduled Work runtime. Terms are immutable — change of payer or '
    'method means revoke and re-authorize.';

-- ── THE DOUBLE-COLLECTION GUARD ──
--
-- V1's only amount policy is "whatever is currently due". Two live arrangements on one account
-- would each resolve the SAME collectible and each collect it, charging the family twice for one
-- obligation. Revoked and failed rows are excluded because they are history and may accumulate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_autopay_one_live_per_account
    ON public.payment_autopay_arrangements (org_id, customer_id)
    WHERE status IN ('active', 'paused');

CREATE INDEX IF NOT EXISTS idx_autopay_live_by_org
    ON public.payment_autopay_arrangements (org_id, status)
    WHERE status IN ('active', 'paused');

-- The method-invalidation convergence reads this: which live arrangements depend on a method that
-- has just become unusable.
CREATE INDEX IF NOT EXISTS idx_autopay_by_method
    ON public.payment_autopay_arrangements (payment_method_id)
    WHERE status IN ('active', 'paused');

-- -----------------------------------------------------------------------------
-- CONSENT IS IMMUTABLE. Lifecycle and attempt telemetry are not.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_autopay_authorization_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id
        OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
        OR NEW.payer_entity_type IS DISTINCT FROM OLD.payer_entity_type
        OR NEW.payer_entity_id IS DISTINCT FROM OLD.payer_entity_id
        OR NEW.payment_method_id IS DISTINCT FROM OLD.payment_method_id
        OR NEW.authorized_by IS DISTINCT FROM OLD.authorized_by
        OR NEW.authorized_at IS DISTINCT FROM OLD.authorized_at
        OR NEW.authorization_ref IS DISTINCT FROM OLD.authorization_ref
        OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
        OR NEW.amount_policy IS DISTINCT FROM OLD.amount_policy
        OR NEW.max_amount_cents IS DISTINCT FROM OLD.max_amount_cents
        OR NEW.timing_policy IS DISTINCT FROM OLD.timing_policy
        OR NEW.timing_offset_days IS DISTINCT FROM OLD.timing_offset_days
        OR NEW.retry_policy IS DISTINCT FROM OLD.retry_policy THEN
        RAISE EXCEPTION
            'autopay arrangement % records what a payer authorized: payer, method, period, amount policy and ceiling never change — revoke it and create a new authorization', OLD.id
            USING ERRCODE = '0A000';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_autopay_authorization_immutability ON public.payment_autopay_arrangements;
CREATE TRIGGER trg_enforce_autopay_authorization_immutability
    BEFORE UPDATE ON public.payment_autopay_arrangements
    FOR EACH ROW EXECUTE FUNCTION public.enforce_autopay_authorization_immutability();

-- -----------------------------------------------------------------------------
-- REVOCATION IS TERMINAL, and so is failure-by-exhaustion.
--
-- Without this a `revoked` row could be set back to `active`, which would resurrect a consent the
-- payer withdrew — the single worst thing this table could allow. Restarting is a NEW row, which
-- also gives the new consent its own `authorized_at`.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_autopay_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.status = 'revoked' AND NEW.status IS DISTINCT FROM 'revoked' THEN
        RAISE EXCEPTION
            'autopay arrangement % was revoked; a withdrawn authorization is never reactivated — create a new arrangement', OLD.id
            USING ERRCODE = '0A000';
    END IF;
    -- `failed` may be revoked (tidying up) but never silently resumed: resuming a arrangement whose
    -- method died would collect on an instrument the payer can no longer honour.
    IF OLD.status = 'failed' AND NEW.status = 'active' THEN
        RAISE EXCEPTION
            'autopay arrangement % failed; it cannot return to active without a new authorization', OLD.id
            USING ERRCODE = '0A000';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_autopay_status_transition ON public.payment_autopay_arrangements;
CREATE TRIGGER trg_enforce_autopay_status_transition
    BEFORE UPDATE ON public.payment_autopay_arrangements
    FOR EACH ROW EXECUTE FUNCTION public.enforce_autopay_status_transition();

-- -----------------------------------------------------------------------------
-- RLS — the same shape as the rest of the childcare money gate.
-- Enroll/pause/resume/revoke are `fin.write` acts at the authority layer; this is defence in depth.
-- -----------------------------------------------------------------------------
ALTER TABLE public.payment_autopay_arrangements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_autopay_arrangements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_autopay_arrangements_same_org ON public.payment_autopay_arrangements;
CREATE POLICY payment_autopay_arrangements_same_org ON public.payment_autopay_arrangements
    FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS payment_autopay_arrangements_write_rolegate ON public.payment_autopay_arrangements;
CREATE POLICY payment_autopay_arrangements_write_rolegate ON public.payment_autopay_arrangements
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

-- -----------------------------------------------------------------------------
-- SELF-TEST — shape, not assumption. A failed apply does not roll back DDL, so this proves the
-- guarantees the handler is about to rely on, and leaves nothing behind.
-- -----------------------------------------------------------------------------
DO $selftest$
DECLARE
    v_org uuid;
    v_customer uuid;
    v_method uuid;
    v_person uuid := gen_random_uuid();
    v_a uuid;
    v_failed boolean;
BEGIN
    SELECT id INTO v_org FROM public.orgs LIMIT 1;
    SELECT id INTO v_customer FROM public.customers WHERE org_id = v_org LIMIT 1;
    SELECT id INTO v_method FROM public.payment_methods WHERE org_id = v_org AND customer_id = v_customer LIMIT 1;
    IF v_org IS NULL OR v_customer IS NULL OR v_method IS NULL THEN
        RAISE NOTICE 'autopay self-test skipped: no org/customer/method fixture present';
        RETURN;
    END IF;

    INSERT INTO public.payment_autopay_arrangements
        (org_id, customer_id, payer_entity_id, payment_method_id, authorized_by, effective_from)
    VALUES (v_org, v_customer, v_person, v_method, v_person, current_date)
    RETURNING id INTO v_a;

    -- 1. A second live arrangement on the same account is refused.
    v_failed := false;
    BEGIN
        INSERT INTO public.payment_autopay_arrangements
            (org_id, customer_id, payer_entity_id, payment_method_id, authorized_by, effective_from)
        VALUES (v_org, v_customer, v_person, v_method, v_person, current_date);
    EXCEPTION WHEN unique_violation THEN v_failed := true;
    END;
    IF NOT v_failed THEN
        RAISE EXCEPTION 'autopay self-test: a second live arrangement was accepted on one account';
    END IF;

    -- 2. Consent terms are immutable.
    v_failed := false;
    BEGIN
        UPDATE public.payment_autopay_arrangements SET max_amount_cents = 999 WHERE id = v_a;
    EXCEPTION WHEN OTHERS THEN v_failed := true;
    END;
    IF NOT v_failed THEN
        RAISE EXCEPTION 'autopay self-test: the authorized ceiling was edited in place';
    END IF;

    -- 3. Lifecycle still moves.
    UPDATE public.payment_autopay_arrangements SET status = 'paused' WHERE id = v_a;

    -- 4. Revocation is terminal.
    UPDATE public.payment_autopay_arrangements
       SET status = 'revoked', revoked_at = now() WHERE id = v_a;
    v_failed := false;
    BEGIN
        UPDATE public.payment_autopay_arrangements
           SET status = 'active', revoked_at = NULL WHERE id = v_a;
    EXCEPTION WHEN OTHERS THEN v_failed := true;
    END;
    IF NOT v_failed THEN
        RAISE EXCEPTION 'autopay self-test: a revoked authorization was reactivated';
    END IF;

    DELETE FROM public.payment_autopay_arrangements WHERE id = v_a;
    RAISE NOTICE 'autopay self-test passed';
END
$selftest$;
