-- =============================================================================
-- PAYMENTS V1 · W2 — THE CANONICAL PAYMENT METHOD REFERENCE.
--
-- A payer can have a card or a bank account on file. This table is what "on file" means in Alloy,
-- and the identity of a stored method is `payment_methods.id` — never the provider's id. Stripe's
-- PaymentMethod is an adapter reference held in a column, exactly as `payment_provider_merchants`
-- holds a connected account id without becoming a Stripe table.
--
-- ── WHY A NEW TABLE, WHICH IS NOT THE DEFAULT ANSWER ──
--
-- `customer_payment_methods` (20260329165048) exists and is NOT extended. It was checked first and
-- rejected on evidence:
--
--   * it has NO org_id. Its only scope is `customer_id`, so every read of it is cross-tenant by
--     construction and the one existing reader (`resolvePaymentSetup`) filters by customer alone.
--     Adding a column would not repair that — every existing row would be untenanted, and the
--     writer that made them is development-era;
--   * it models ONE rail. `stripe_payment_method_id`, `brand`, `last4` describe a card and cannot
--     express a bank account, a mandate, or a verification that takes days;
--   * it has no lifecycle at all: no verification state, no usability, no revocation, no
--     replacement. An operator removing a method could only DELETE it, which destroys the reference
--     a historical payment needs;
--   * its unique key is (customer_id, stripe_payment_method_id) — the provider's id is load-bearing
--     identity, which is precisely the inversion W2 exists to end.
--
-- It is superseded development residue and this migration's companion change deletes it.
--
-- ── WHAT THIS IS NOT ──
--
-- Not a payer. Not a customer. Not an autopay arrangement. Not a ledger. It answers exactly one
-- question: which stored instruments may this payer use, through which provider handles, and in
-- what state. `payments` remains the only place money is recorded.
--
-- ── WHERE THE PROVIDER HANDLE LIVES, AND WHY IT MATTERS HERE ──
--
-- The durable handle is on the PLATFORM account: a platform Customer owns a platform PaymentMethod,
-- and collection clones that method onto the connected merchant for each charge. Stripe confirms
-- both halves of this: cloning supports exactly `card` and `us_bank_account`, and a clone is
-- consumed by the charge it serves. So the connected-account object is disposable and this row is
-- the thing that survives — which is what lets an organisation replace its merchant without every
-- family re-entering their card.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_methods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- TENANCY IS A COLUMN, NOT AN INFERENCE. The legacy table's absence of this is the single
    -- biggest reason it is not extended. Every read filters on it; every write derives it from the
    -- authenticated session and never from a request body.
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,

    /*
     * WHOSE METHOD THIS IS — the payer, and only the payer.
     *
     * Not the child, not the responsible party, not the primary household contact. A grandparent
     * may hold the card that settles a parent's obligation; using it does not move responsibility,
     * and `payments.payer_entity_type/payer_entity_id` records the same pair for the same reason.
     */
    payer_entity_type text NOT NULL CHECK (payer_entity_type IN ('person', 'agency')),
    payer_entity_id uuid NOT NULL,

    /*
     * WHICH ACCOUNT MAY USE IT — optional, and deliberately separate from ownership.
     *
     * Ownership says whose instrument it is; scope says which account's obligations it may settle.
     * A method with no scope is owned but not yet usable for collection anywhere, which is why a
     * default requires one (see the CHECK below).
     */
    customer_id uuid REFERENCES public.customers (id),

    -- The rail, in Alloy's vocabulary. `ach` is Alloy's word; `us_bank_account` is Stripe's and
    -- stays in the adapter. These are also exactly the two types Stripe permits cloning.
    rail text NOT NULL CHECK (rail IN ('card', 'ach')),

    processor text NOT NULL CHECK (processor IN ('stripe')),

    /*
     * THE ADAPTER HANDLES. Identifiers, never secrets, and never canonical identity.
     *
     * `provider_customer_ref` is the PLATFORM-side Customer that owns the stored method. It is an
     * adapter object associated with the canonical payer — it is not an Alloy Payer and there is no
     * table for it. Reusing one platform Customer per payer is achieved by reading it back off this
     * column, which works precisely because rows here are never deleted.
     *
     * `provider_method_ref` is the PLATFORM-side PaymentMethod. The connected-account clone is not
     * stored anywhere: it is created per collection and consumed by it.
     */
    provider_customer_ref text NOT NULL CHECK (char_length(btrim(provider_customer_ref)) > 0),
    provider_method_ref text NOT NULL CHECK (char_length(btrim(provider_method_ref)) > 0),

    /*
     * THE BANK AUTHORIZATION. Card rows leave both null.
     *
     * Stripe duplicates the mandate onto the clone, so one platform-side authorization serves every
     * connected merchant — but only if it was NOT taken `on_behalf_of` a particular account, which
     * is why the adapter never sets that parameter.
     */
    mandate_ref text,
    mandate_accepted_at timestamptz,

    /*
     * SAFE DISPLAY ONLY — what an operator needs to recognise the instrument on a phone call.
     *
     * There is no column here for a PAN, a CVC, an account number or a routing number, and that is
     * the point: Alloy cannot store what it has nowhere to put. For a bank row, `display_brand`
     * carries the bank name and `display_last4` the last four of the account.
     */
    display_brand text,
    display_last4 text CHECK (display_last4 IS NULL OR display_last4 ~ '^[0-9]{2,4}$'),
    display_exp_month smallint CHECK (display_exp_month IS NULL OR display_exp_month BETWEEN 1 AND 12),
    display_exp_year smallint CHECK (display_exp_year IS NULL OR display_exp_year BETWEEN 2000 AND 2100),

    /*
     * TWO INDEPENDENT LIFECYCLES, because they answer different questions.
     *
     * `verification_state` is the provider's answer about the instrument itself — a bank account
     * pending microdeposits is `pending`, and a card that tokenised successfully is `verified`.
     *
     * `usability_state` is whether Alloy may collect with it now. A method can be verified and
     * still unusable: expired, blocked by a dispute that invalidated its mandate, or revoked by an
     * operator. Collapsing these into one column would force a lie in whichever direction was
     * chosen.
     */
    verification_state text NOT NULL DEFAULT 'unverified'
        CHECK (verification_state IN ('unverified', 'pending', 'verified', 'failed')),
    usability_state text NOT NULL DEFAULT 'usable'
        CHECK (usability_state IN ('usable', 'blocked', 'expired', 'revoked')),

    is_default boolean NOT NULL DEFAULT false,

    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    verified_at timestamptz,
    revoked_at timestamptz,
    revoked_reason text,

    -- A replacement is a NEW row. The old one points forward; its provider reference is never
    -- rewritten into the new one, so a payment that named the old method still names it truthfully.
    replaced_by_id uuid REFERENCES public.payment_methods (id),

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,

    -- A default must be usable, and must be scoped to the account it is default FOR. Both are
    -- structural because both are read at collection time, where a service check is too late.
    CONSTRAINT payment_methods_default_is_usable_chk
        CHECK (NOT is_default OR usability_state = 'usable'),
    CONSTRAINT payment_methods_default_needs_scope_chk
        CHECK (NOT is_default OR customer_id IS NOT NULL),

    -- Revocation is a pair of facts or neither of them.
    CONSTRAINT payment_methods_revocation_pair_chk
        CHECK ((usability_state = 'revoked') = (revoked_at IS NOT NULL)),

    -- A mandate reference and its acceptance moment travel together.
    CONSTRAINT payment_methods_mandate_pair_chk
        CHECK ((mandate_ref IS NULL) = (mandate_accepted_at IS NULL)),

    -- Nothing may point at itself as its own replacement.
    CONSTRAINT payment_methods_replacement_not_self_chk
        CHECK (replaced_by_id IS NULL OR replaced_by_id <> id)
);

COMMENT ON TABLE public.payment_methods IS
    'The canonical provider-neutral reference to a payer''s stored card or bank account. Identity is this row''s id; provider ids are adapter references. Holds no credential: no PAN, no CVC, no account or routing number.';

-- -----------------------------------------------------------------------------
-- ONE DEFAULT PER ACCOUNT PER RAIL — structurally, not by service discipline.
--
-- Two defaults for one account and rail is not a richer configuration; it is an unanswerable
-- question at collection time, resolved by whichever row a query returned first. A partial unique
-- index refuses it even when two operators set a default concurrently, which a read-then-write
-- check cannot. Card and bank are independent scopes, which is why `rail` is in the key.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_methods_default_account_rail
    ON public.payment_methods (customer_id, rail)
    WHERE is_default;

/*
 * A PROVIDER METHOD BELONGS TO ONE ALLOY METHOD.
 *
 * Without this, two organisations could each record a row naming the same platform PaymentMethod
 * and both would believe they may collect with it — the cross-tenant substitution this table's
 * org_id exists to refuse, arriving through the provider reference instead. Not partial: a revoked
 * row keeps its reference, and re-adding an instrument creates a genuinely new provider object.
 */
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_methods_provider_method_ref
    ON public.payment_methods (processor, provider_method_ref);

CREATE INDEX IF NOT EXISTS idx_payment_methods_account
    ON public.payment_methods (org_id, customer_id, rail, usability_state);

CREATE INDEX IF NOT EXISTS idx_payment_methods_payer
    ON public.payment_methods (org_id, payer_entity_type, payer_entity_id);

-- The webhook resolves a provider event to a tenant through this, never through event metadata.
CREATE INDEX IF NOT EXISTS idx_payment_methods_provider_customer
    ON public.payment_methods (processor, provider_customer_ref);

-- -----------------------------------------------------------------------------
-- RLS — the same shape as payment_provider_merchants, with `ops` able to write.
--
-- Adding a family's card is ordinary financial operations work (`fin.write`), which `ops` holds.
-- Connecting the organisation's merchant is not, and stays at `fin.provider` and owner/admin.
-- -----------------------------------------------------------------------------
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_methods_same_org ON public.payment_methods;
CREATE POLICY payment_methods_same_org ON public.payment_methods
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS payment_methods_write_rolegate ON public.payment_methods;
CREATE POLICY payment_methods_write_rolegate ON public.payment_methods
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

-- -----------------------------------------------------------------------------
-- WHAT A PROVIDER EVENT MAY NEVER REWRITE.
--
-- Stripe can legitimately tell us a card's expiry moved or an instrument stopped working, and the
-- adapter applies that to display and usability. It must never be able to change WHOSE method this
-- is, WHICH account may use it, WHICH rail it is, or WHICH provider object it names — an event
-- arriving with a different `customer` must fail, not silently re-home a stored instrument.
--
-- The service layer already refuses this. The trigger is here because the service layer is one
-- deploy away from a mistake and this is where money meets ownership.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_payment_method_identity_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id
        OR NEW.payer_entity_type IS DISTINCT FROM OLD.payer_entity_type
        OR NEW.payer_entity_id IS DISTINCT FROM OLD.payer_entity_id
        OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
        OR NEW.rail IS DISTINCT FROM OLD.rail
        OR NEW.processor IS DISTINCT FROM OLD.processor
        OR NEW.provider_customer_ref IS DISTINCT FROM OLD.provider_customer_ref
        OR NEW.provider_method_ref IS DISTINCT FROM OLD.provider_method_ref THEN
        RAISE EXCEPTION 'payment method % is bound: ownership, account scope, rail and provider handles never change in place — revoke it and add a replacement', OLD.id
            USING ERRCODE = '0A000';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_payment_method_identity_immutability ON public.payment_methods;
CREATE TRIGGER trg_enforce_payment_method_identity_immutability
    BEFORE UPDATE ON public.payment_methods
    FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_method_identity_immutability();

COMMENT ON FUNCTION public.enforce_payment_method_identity_immutability() IS
    'A stored payment method never changes owner, account scope, rail or provider handle in place. Provider events may update display, verification and usability only.';

-- -----------------------------------------------------------------------------
-- SETTING A DEFAULT IS ONE STATEMENT PAIR IN ONE TRANSACTION.
--
-- The partial unique index means the old default must be cleared before the new one is set. Doing
-- that as two client round trips has a window in which the account has NO default, and a failure in
-- between leaves it that way — so the pair lives in the database, where it is atomic by definition.
--
-- It also RE-DERIVES the scope rather than accepting one: the caller names a method, and the
-- function reads that method's own org, customer and rail. A caller cannot clear another account's
-- default by describing the scope differently from the row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_default_payment_method(
    p_method_id uuid,
    p_org_id uuid,
    p_actor uuid DEFAULT NULL
)
RETURNS public.payment_methods
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
DECLARE
    v_row public.payment_methods;
BEGIN
    SELECT * INTO v_row FROM public.payment_methods
    WHERE id = p_method_id AND org_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'payment method % is not in organization %', p_method_id, p_org_id
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_row.usability_state <> 'usable' THEN
        RAISE EXCEPTION 'payment method % is %, so it cannot be made the default', p_method_id, v_row.usability_state
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_row.customer_id IS NULL THEN
        RAISE EXCEPTION 'payment method % has no account scope, so there is nothing for it to be the default of', p_method_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Clear first: the partial unique index would otherwise refuse the set.
    UPDATE public.payment_methods
    SET is_default = false, updated_at = now(), updated_by = p_actor
    WHERE customer_id = v_row.customer_id
      AND rail = v_row.rail
      AND is_default
      AND id <> p_method_id;

    UPDATE public.payment_methods
    SET is_default = true, updated_at = now(), updated_by = p_actor
    WHERE id = p_method_id
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$function$;

COMMENT ON FUNCTION public.set_default_payment_method(uuid, uuid, uuid) IS
    'Moves the default flag within one account and rail atomically. Re-derives the scope from the named method so a caller cannot clear another account default.';

-- -----------------------------------------------------------------------------
-- SELF-TEST — the DDL above either took effect or this migration fails.
--
-- A failed apply does not roll back DDL, so this asserts the SHAPE rather than assuming the
-- statements ran. Behavioural claims (a second default is refused, an owner rewrite raises) need
-- seeded orgs and customers and are proved in the certification suite, not here.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_missing text;
    v_cols int;
BEGIN
    IF to_regclass('public.payment_methods') IS NULL THEN
        RAISE EXCEPTION 'payment_methods was not created';
    END IF;

    SELECT count(*) INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_methods'
      AND column_name IN (
        'id','org_id','payer_entity_type','payer_entity_id','customer_id','rail','processor',
        'provider_customer_ref','provider_method_ref','mandate_ref','mandate_accepted_at',
        'display_brand','display_last4','display_exp_month','display_exp_year',
        'verification_state','usability_state','is_default','created_by','created_at',
        'verified_at','revoked_at','revoked_reason','replaced_by_id','metadata');
    IF v_cols <> 25 THEN
        RAISE EXCEPTION 'payment_methods is missing canonical columns: found % of 25', v_cols;
    END IF;

    SELECT string_agg(needed, ', ') INTO v_missing
    FROM (VALUES
        ('uq_payment_methods_default_account_rail'),
        ('uq_payment_methods_provider_method_ref'),
        ('idx_payment_methods_account'),
        ('idx_payment_methods_payer'),
        ('idx_payment_methods_provider_customer')
    ) AS t(needed)
    WHERE to_regclass('public.' || needed) IS NULL;
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'payment_methods is missing indexes: %', v_missing;
    END IF;

    SELECT string_agg(needed, ', ') INTO v_missing
    FROM (VALUES
        ('payment_methods_default_is_usable_chk'),
        ('payment_methods_default_needs_scope_chk'),
        ('payment_methods_revocation_pair_chk'),
        ('payment_methods_mandate_pair_chk'),
        ('payment_methods_replacement_not_self_chk')
    ) AS t(needed)
    WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = needed);
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'payment_methods is missing constraints: %', v_missing;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_enforce_payment_method_identity_immutability'
          AND tgrelid = 'public.payment_methods'::regclass
    ) THEN
        RAISE EXCEPTION 'the payment method immutability trigger is not attached';
    END IF;

    IF to_regprocedure('public.set_default_payment_method(uuid, uuid, uuid)') IS NULL THEN
        RAISE EXCEPTION 'set_default_payment_method was not created';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'payment_methods'
          AND policyname = 'payment_methods_write_rolegate'
    ) THEN
        RAISE EXCEPTION 'the payment method write role gate is not present';
    END IF;

    RAISE NOTICE 'payment_methods: 25 canonical columns, 5 indexes, 5 constraints, immutability trigger, atomic default function and RLS gates all present';
END $$;
