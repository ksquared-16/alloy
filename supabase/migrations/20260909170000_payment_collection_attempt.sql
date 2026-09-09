-- =============================================================================
-- THREAD 8B SLICE D — what Alloy asked an executor to collect, which is not money.
--
-- A PaymentIntent is a REQUEST. Money is a Thread 8 receipt. Between them sit states that look like
-- progress and are not cash — `requires_action`, `processing` — and the whole point of this table is
-- that those states have somewhere truthful to live that is NOT `payments`.
--
-- ── WHY NOT CANONICAL `payments`, WHICH IS THE TEMPTING ANSWER ──
--
-- Because the legacy job path already does exactly that and shows the cost. `stripe.py` calls
-- `insert_payment(..., payment_status_id=pending_uuid)` BEFORE `PaymentIntent.create`, so a request
-- that may never be paid is written into the table Thread 8's balance rule reads. It is survivable
-- there only because the balance counts `status = 'posted'` — one predicate standing between an
-- abandoned checkout and a family's outstanding. Repeating that for childcare would put every
-- half-finished card entry into the money table and make "is this cash?" a question about a status
-- column rather than about which table the row is in.
--
-- Nothing else could own it: `payment_attempt`, `collection_attempt`, `processor_attempt` and
-- `payment_intent` match zero rows across every migration and all of web/lib.
--
-- ── WHAT THIS ANSWERS, AND WHAT IT MUST NEVER ANSWER ──
--
--   answers    what did we ask which executor to collect, for which merchant and intent, and what
--              has the executor said back
--   NEVER      what does the family owe. Not balance, not outstanding, not responsibility, not
--              subsidy, not allocation, not journal. Those are Threads 6/8/9/5 and stay there.
--
-- Processor-neutral by construction: `processor` and `rail` are columns, and nothing here is named
-- for Stripe or for childcare. ACH reuses this table unchanged; a second processor needs no second
-- table. A manual rail — cash, check, money order — never appears here at all, because nobody asked
-- an executor to do anything.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_collection_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,

    -- Which executor, and which merchant binding authorised it. The FK is the tenancy anchor: an
    -- attempt cannot exist without a merchant row, and that row already carries the org.
    processor text NOT NULL CHECK (processor IN ('stripe')),
    merchant_id uuid NOT NULL REFERENCES public.payment_provider_merchants (id) ON DELETE RESTRICT,
    -- Denormalised from the merchant so a webhook can resolve tenancy with one indexed read, and so
    -- the attempt still names the account that collected it after a merchant is withdrawn.
    provider_account_ref text NOT NULL,

    -- The rail, from Thread 8's vocabulary. Only externally executed rails can appear.
    rail text NOT NULL CHECK (rail IN ('card', 'ach')),

    -- WHAT the collection is for, in canonical terms. The charge is the application target; the
    -- billable source is the account the money is received against. Both are resolved server-side.
    billable_source_type text NOT NULL CHECK (billable_source_type IN ('enrollment_agreement', 'customer')),
    billable_source_id uuid NOT NULL,
    charge_id uuid REFERENCES public.charges (id) ON DELETE RESTRICT,

    -- Who is actually paying, when that is known and differs from who is responsible. Recorded as
    -- evidence only: Thread 6 owns responsibility and an actual payer never rewrites it.
    payer_person_id uuid,

    currency text NOT NULL DEFAULT 'USD',
    -- The amount the SERVER derived and validated, not the amount a browser asked for.
    requested_amount_cents bigint NOT NULL CHECK (requested_amount_cents > 0),

    /*
     * THE IDEMPOTENCY IDENTITY, owned by Alloy rather than by the browser or by Stripe.
     *
     * A client-generated uuid is a request identifier, not an authority: two tabs produce two, and a
     * retry after a dropped response produces a third. This key is derived server-side from the
     * canonical intent (org, charge, amount, rail, day), so the same intention collapses onto the
     * same attempt no matter how many times it is submitted — and it is what is handed to Stripe as
     * its idempotency key, so one intent can only ever mint one PaymentIntent.
     */
    intent_key text NOT NULL CHECK (char_length(btrim(intent_key)) > 0),

    -- The provider's own identity for the request, once it exists. Null between row creation and a
    -- successful create call — which is itself the state that makes retry safe.
    provider_transaction_id text,

    /*
     * THE PROCESSOR'S STATE — never a Thread 8 receipt status.
     *
     * `succeeded` here means the executor says it collected. It does NOT mean Alloy has recognised
     * cash: that requires the Slice F posting authority. Keeping the vocabularies separate is the
     * point of the table.
     */
    processor_state text NOT NULL DEFAULT 'initiated'
        CHECK (processor_state IN (
            'initiated',
            'requires_payment_method',
            'requires_action',
            'processing',
            'succeeded',
            'failed',
            'canceled'
        )),
    processor_state_at timestamptz NOT NULL DEFAULT now(),
    -- Bounded provider detail for investigation. Never card data.
    last_provider_detail jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

COMMENT ON TABLE public.payment_collection_attempts IS
    'What Alloy asked an external executor to collect, for which merchant and financial intent, and what the executor has said back. Never authoritative for balance, outstanding, responsibility, subsidy, allocation or journal — a canonical receipt lives in payments and is created only by the Thread 8 posting authority. Manual rails never appear here.';

-- ONE ATTEMPT PER CANONICAL INTENT. The database, not a service check: two concurrent submissions
-- both pass a "have I seen this intent?" lookup, and the loser must find the winner's row rather
-- than mint a second PaymentIntent against the family's card.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_collection_attempts_org_intent
    ON public.payment_collection_attempts (org_id, intent_key);

-- One provider transaction maps to exactly one attempt, which is what lets a webhook carrying a
-- `pi_…` resolve to a single canonical attempt with no ambiguity.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_collection_attempts_provider_txn
    ON public.payment_collection_attempts (processor, provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_collection_attempts_org_state
    ON public.payment_collection_attempts (org_id, processor_state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_collection_attempts_charge
    ON public.payment_collection_attempts (org_id, charge_id)
    WHERE charge_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- RLS — read within the org, write behind the same role gate childcare money uses.
-- -----------------------------------------------------------------------------
ALTER TABLE public.payment_collection_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_collection_attempts_same_org ON public.payment_collection_attempts;
CREATE POLICY payment_collection_attempts_same_org ON public.payment_collection_attempts
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS payment_collection_attempts_write_rolegate ON public.payment_collection_attempts;
CREATE POLICY payment_collection_attempts_write_rolegate ON public.payment_collection_attempts
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

-- -----------------------------------------------------------------------------
-- A TERMINAL PROCESSOR STATE DOES NOT REGRESS.
--
-- Stripe delivery is at-least-once and unordered: a `processing` event can arrive after the
-- `succeeded` that superseded it. Applying it would walk a collected payment backwards, and a later
-- reader would see an attempt still in flight for money the provider already took.
--
-- Terminal states are `succeeded`, `failed` and `canceled`. Re-asserting the SAME terminal state is
-- allowed — that is what a duplicate delivery looks like, and it must be harmless rather than an
-- error. Moving between two different terminal states is refused: the provider does not un-succeed.
--
-- In the trigger rather than the service because two deliveries can execute concurrently, and a
-- service check would let both read the pre-transition row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_collection_attempt_state_progression()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    terminal text[] := ARRAY['succeeded'::text, 'failed'::text, 'canceled'::text];
BEGIN
    IF NEW.processor_state IS NOT DISTINCT FROM OLD.processor_state THEN
        RETURN NEW;
    END IF;

    IF OLD.processor_state = ANY (terminal) THEN
        RAISE EXCEPTION 'collection attempt % is terminal at % and cannot move to %; provider evidence does not un-succeed',
            OLD.id, OLD.processor_state, NEW.processor_state
            USING ERRCODE = '0A000';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_collection_attempt_state_progression() IS
    'A collection attempt that reached succeeded, failed or canceled stays there. Re-asserting the same terminal state is harmless (that is a duplicate delivery); moving to a different one is refused, so an out-of-order provider event cannot walk collected money backwards.';

DROP TRIGGER IF EXISTS trg_enforce_collection_attempt_state_progression ON public.payment_collection_attempts;
CREATE TRIGGER trg_enforce_collection_attempt_state_progression
    BEFORE UPDATE OF processor_state ON public.payment_collection_attempts
    FOR EACH ROW EXECUTE FUNCTION public.enforce_collection_attempt_state_progression();
