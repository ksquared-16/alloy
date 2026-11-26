-- =============================================================================
-- THREAD 8B SLICE C — which merchant collects, and for whom.
--
-- Director decision: childcare providers are merchants on their own Stripe connected accounts, and
-- Alloy orchestrates direct charges on those accounts. That makes "which connected account belongs
-- to this organization" a canonical fact the database must own, because it decides whose bank
-- account a family's money lands in. Getting it from request metadata would let the caller choose.
--
-- ── WHY A NEW TABLE, WHICH IS NOT THE DEFAULT ANSWER ──
--
-- `communication_provider_accounts` (20260715120000) is structurally close: org_id, provider_type,
-- status, verification_state, capabilities, config, provider_account_ref. Reusing it was checked
-- first and rejected on evidence, not taste:
--
--   * it is the Communications Identity Platform's table by name, by doctrine doc, and by its FK to
--     `communication_provider_bindings`; its four consumers are all communications
--     (applyBindingIdentityProjection, loadIdentityContext, receivingDomain, identity_resolver.py);
--   * putting a payment merchant inside it would make Communications' RLS, role gates and migrations
--     govern who may collect money — a Communications change could then break collection;
--   * its `secret_ref` exists to delegate a TENANT-SUPPLIED secret to Vault. Stripe Connect standard
--     accounts give Alloy no per-org secret at all: collection uses the platform key plus the
--     connected account id. There is no secret here to own, so the one thing that table adds beyond
--     shape is the thing this mapping does not need.
--
-- Nothing else models a payment provider account — `payment_provider`, `merchant_account` and
-- `connected_account` match zero rows across every migration and all of web/lib. So this is the
-- first, and it is deliberately processor-agnostic: `processor` is a column, not the table's name,
-- because Thread 8's whole model separates the rail from the executor and a second processor must
-- not need a second table.
--
-- ── WHAT THIS IS NOT ──
--
-- Not a ledger. Not a balance. Not a payment. It answers exactly one question — for this org and
-- this processor, which external merchant account collects, and is it able to. `payments` remains
-- the only place money is recorded.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_provider_merchants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,

    -- The executor. `manual` never appears here: cash, check and money order have no merchant, and
    -- a row in this table is precisely the statement that an external processor is involved.
    processor text NOT NULL CHECK (processor IN ('stripe')),

    -- The external account id — `acct_…` for Stripe. Never a secret: a connected account id is an
    -- identifier, and Connect standard accounts are collected against with the PLATFORM key plus
    -- this id, so there is no per-org credential to store or leak.
    provider_account_ref text NOT NULL
        CHECK (char_length(btrim(provider_account_ref)) > 0),

    /*
     * READINESS IS THE PROVIDER'S ANSWER, CACHED — never Alloy's opinion.
     *
     *   not_connected        no usable account (this row should not exist in that state)
     *   onboarding_incomplete  the merchant has not finished Stripe onboarding
     *   restricted           Stripe has restricted the account; charges are refused
     *   ready                charges_enabled and details_submitted
     *
     * The collection path re-resolves readiness against Stripe rather than trusting this column as
     * authority; the column exists so an operator surface can say something truthful without a
     * provider round trip, and so a stale value can be seen to be stale.
     */
    readiness text NOT NULL DEFAULT 'not_connected'
        CHECK (readiness IN ('not_connected', 'onboarding_incomplete', 'restricted', 'ready')),
    readiness_checked_at timestamptz,
    readiness_detail jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Withdrawn without deletion, so the history of who collected remains legible.
    is_active boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

COMMENT ON TABLE public.payment_provider_merchants IS
    'Which external merchant account collects for an organization, per processor. Not a ledger and not a payment: it answers only "whose merchant account, and can it charge". Connected account ids are identifiers, never secrets.';

-- ONE ACTIVE MERCHANT PER ORG PER PROCESSOR. Two active Stripe accounts for one organization is not
-- a richer configuration, it is an unanswerable question at collection time — and the answer would
-- be chosen by whichever row a query happened to return first. The index, not a service check,
-- because two concurrent onboardings both pass a lookup.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_provider_merchants_active_org_processor
    ON public.payment_provider_merchants (org_id, processor)
    WHERE is_active;

-- A connected account belongs to ONE organization. Without this, org B could claim org A's account
-- and collect a family's money into someone else's bank account — the substitution attack Slice C
-- exists to refuse.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_provider_merchants_account_ref
    ON public.payment_provider_merchants (processor, provider_account_ref)
    WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_payment_provider_merchants_org
    ON public.payment_provider_merchants (org_id, processor, readiness);

-- -----------------------------------------------------------------------------
-- RLS — same shape as the childcare money gate in 20260903190000.
-- -----------------------------------------------------------------------------
ALTER TABLE public.payment_provider_merchants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_provider_merchants_same_org ON public.payment_provider_merchants;
CREATE POLICY payment_provider_merchants_same_org ON public.payment_provider_merchants
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS payment_provider_merchants_write_rolegate ON public.payment_provider_merchants;
CREATE POLICY payment_provider_merchants_write_rolegate ON public.payment_provider_merchants
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- -----------------------------------------------------------------------------
-- The connected account id is immutable once set.
--
-- Repointing an org's merchant in place would silently redirect where money settles, and every
-- payment already recorded against the old account would still name it. Withdraw the row
-- (`is_active = false`) and add a new one; the partial unique indexes make that the only way.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_payment_merchant_account_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.provider_account_ref IS DISTINCT FROM OLD.provider_account_ref
        OR NEW.processor IS DISTINCT FROM OLD.processor
        OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
        RAISE EXCEPTION 'payment merchant % is bound: withdraw it (is_active = false) and add a new mapping rather than repointing where money settles', OLD.id
            USING ERRCODE = '0A000';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_payment_merchant_account_immutability ON public.payment_provider_merchants;
CREATE TRIGGER trg_enforce_payment_merchant_account_immutability
    BEFORE UPDATE ON public.payment_provider_merchants
    FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_merchant_account_immutability();

COMMENT ON FUNCTION public.enforce_payment_merchant_account_immutability() IS
    'A merchant mapping never changes which external account it names. Withdraw and re-add instead, so money already collected keeps naming the account that collected it.';
