/**
 * SLICE D — ASKING AN EXECUTOR TO COLLECT, without letting it decide what is owed.
 *
 * The browser may express an intent: this charge, this much, by card. It may not author any of it.
 * Everything financial is re-derived here from canonical truth before Stripe is told anything, so a
 * stale tab, an edited request and a replayed submission all converge on the same server answer.
 *
 * Nothing in this module creates a payment. A PaymentIntent is a REQUEST; a receipt is Thread 8's,
 * and only the Slice F posting authority may write one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveFamilyCollectible } from "@/lib/financials/subsidy/resolveFamilyCollectible";

import { resolveCollectionMerchant, type MerchantRefusal } from "./providerMerchant";
import {
    materializeMethodForMerchant,
    resolveCollectionMethod,
    type PaymentMethodRecord,
} from "./paymentMethodService";

export type CreateCardCollectionInput = {
    /** From the authenticated session. The only tenancy input; never from the request body. */
    orgId: string;
    /** The obligation being settled. Its billable source becomes the collection's account. */
    chargeId: string;
    /** The operator's INTENDED amount. Validated against canonical truth, never trusted. */
    requestedAmountCents: number;
    actorUserId?: string | null;
    /** Who is actually paying, when known. Evidence only — it never rewrites responsibility. */
    payerPersonId?: string | null;
    /**
     * WHICH RAIL is being asked for. Defaults to card, which is every caller written before
     * Thread 8C. The rail is already part of the intent key, so a card and an ACH collection of the
     * same charge for the same amount are correctly two different intents rather than one.
     */
    rail?: "card" | "ach";
    /**
     * A STORED METHOD to charge, by its canonical Alloy id (Payments W2).
     *
     * Absent means the payer is present and will confirm in the browser, which is every caller
     * written before W2 and is unchanged. Present means collect from an instrument already on file:
     * the same attempt, the same PaymentIntent call, the same direct charge and the same canonical
     * posting — only the provider is additionally told WHICH method and to confirm now.
     *
     * It is a canonical id, never a provider reference. A caller cannot name a Stripe PaymentMethod
     * here, so a browser cannot charge an instrument Alloy has not recorded.
     */
    paymentMethodId?: string | null;
};

export type CollectionRefusalReason =
    | MerchantRefusal["reason"]
    /** The merchant can take cards but the provider has not enabled ACH for it. */
    | "ach_not_enabled"
    | "charge_not_found"
    | "charge_not_collectible"
    | "amount_exceeds_collectible"
    | "invalid_amount"
    | "currency_mismatch"
    /* W2 — a stored method was named but may not be used. */
    | "method_not_found"
    | "method_not_usable"
    | "method_wrong_account"
    | "method_rail_mismatch"
    | "method_unavailable_at_provider"
    /* W3 — the stored method's owner is not the payer this attempt claims. */
    | "method_payer_mismatch";

export type CreateCardCollectionResult =
    | {
          ok: true;
          attemptId: string;
          providerTransactionId: string;
          /** Handed to Stripe.js in the browser. Not a secret Alloy owns, and not a credential. */
          clientSecret: string;
          connectedAccountRef: string;
          amountCents: number;
          currency: string;
          /** True when this intent already existed — a retry, not a second charge. */
          reused: boolean;
          /**
           * The canonical stored method this charge used, when one was named. Null for a
           * present-payer collection. Never a provider reference.
           */
          paymentMethodId?: string | null;
      }
    | { ok: false; reason: CollectionRefusalReason; message: string };

/**
 * The durable, Alloy-owned identity of one collection intention.
 *
 * Derived, not supplied: a browser uuid is a request id, and two tabs produce two of them. Keyed on
 * what actually makes an intent the same intent — this charge, this amount, this rail, today — so a
 * resubmission collapses onto the existing attempt instead of minting a second PaymentIntent against
 * the family's card. The day is included for the same reason Thread 8's own key includes it: paying
 * the same amount against the same charge tomorrow is a real second payment, not a retry.
 */
/**
 * The ACCOUNT a charge settles against, whichever way its billable source names it.
 *
 * Returns "" only when the source genuinely cannot be mapped to an account — in which case the
 * stored-method scope check has nothing to compare and the method's own org scope is the boundary
 * that remains. That is a narrower guarantee, and it is why this resolves rather than guesses.
 */
async function resolveChargeAccount(
    supabase: SupabaseClient,
    orgId: string,
    source: { billable_source_type: string; billable_source_id: string },
): Promise<string> {
    if (source.billable_source_type === "customer") return t(source.billable_source_id);
    if (source.billable_source_type === "enrollment_agreement") {
        const { data } = await supabase
            .from("child_enrollment_agreements")
            .select("customer_id")
            .eq("org_id", orgId)
            .eq("id", source.billable_source_id)
            .maybeSingle();
        return t((data as { customer_id?: unknown } | null)?.customer_id);
    }
    return "";
}

export function deriveIntentKey(input: {
    chargeId: string;
    amountCents: number;
    rail: string;
    day?: string;
}): string {
    const day = input.day ?? new Date().toISOString().slice(0, 10);
    return ["collect", input.chargeId, String(input.amountCents), input.rail, day].join(":");
}

const t = (v: unknown): string => (v != null ? String(v).trim() : "");

type StripeCall = (
    path: string,
    body: Record<string, string>,
    headers: Record<string, string>,
) => Promise<{ status: number; body: Record<string, unknown> }>;

/** Real Stripe unless a caller injects otherwise. The secret is read from the environment only. */
const defaultStripeCall: StripeCall = async (path, body, headers) => {
    const secret = process.env.STRIPE_SECRET_KEY ?? "";
    if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured for this runtime");
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/x-www-form-urlencoded",
            ...headers,
        },
        body: new URLSearchParams(body).toString(),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

/**
 * An attempt that already has a PaymentIntent, described without creating anything.
 *
 * The client secret is re-read from Stripe rather than stored: it is the browser's handle on the
 * intent, and keeping a copy in Alloy's database would be storing a credential-shaped value for no
 * reason. Read on the CONNECTED account, because that is where the intent lives.
 */
async function describeExistingAttempt(
    supabase: SupabaseClient,
    attemptId: string,
    providerTransactionId: string,
    connectedAccountRef: string,
    input: CreateCardCollectionInput,
    currency: string,
): Promise<CreateCardCollectionResult> {
    const secret = process.env.STRIPE_SECRET_KEY ?? "";
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${providerTransactionId}`, {
        headers: { Authorization: `Bearer ${secret}`, "Stripe-Account": connectedAccountRef },
    });
    const body = (await res.json()) as { client_secret?: string; status?: string };

    if (res.ok && body.status) {
        // Keep the projection honest even on a pure retry: the provider may have moved on since the
        // row was last written, and a retry is a perfectly good moment to notice.
        await supabase
            .from("payment_collection_attempts")
            .update({
                processor_state: mapStripeStatus(body.status),
                processor_state_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", attemptId)
            .neq("processor_state", mapStripeStatus(body.status));
    }

    return {
        ok: true,
        attemptId,
        providerTransactionId,
        clientSecret: String(body.client_secret ?? ""),
        connectedAccountRef,
        amountCents: input.requestedAmountCents,
        currency,
        reused: true,
    };
}

export async function createCardCollection(
    supabase: SupabaseClient,
    input: CreateCardCollectionInput,
    stripeCall: StripeCall = defaultStripeCall,
): Promise<CreateCardCollectionResult> {
    const rail = input.rail ?? "card";

    if (!Number.isInteger(input.requestedAmountCents) || input.requestedAmountCents <= 0) {
        return {
            ok: false,
            reason: "invalid_amount",
            message: "A collection amount must be a positive whole number of cents.",
        };
    }

    // ── 1. WHOSE MERCHANT ACCOUNT. Refuses rather than falling back to the platform. ─────────────
    const merchantResolution = await resolveCollectionMerchant(supabase, input.orgId, "stripe");
    if (!merchantResolution.ok) return merchantResolution;
    const merchant = merchantResolution.merchant;

    /*
     * ── 1b. AND WHETHER IT CAN TAKE THIS RAIL ────────────────────────────────────────────────────
     *
     * Being able to charge is not being able to take ACH. The governed test merchant was
     * charges-enabled with `card_payments: active` and no `us_bank_account_ach_payments` capability
     * at all — asking it for a bank collection would have been refused by the provider AFTER the
     * operator was told the collection was under way. `null` readiness means nobody has asked the
     * provider yet, which fails closed here and changes nothing for cards.
     */
    if (rail === "ach" && merchant.achReadiness !== "ready") {
        return {
            ok: false,
            reason: "ach_not_enabled",
            message:
                merchant.achReadiness === "restricted"
                    ? "Bank transfers are not enabled on this organization's merchant account yet."
                    : "This organization's merchant account cannot accept bank transfers.",
        };
    }

    /*
     * ── 2. WHAT IS ACTUALLY COLLECTIBLE ──────────────────────────────────────────────────────────
     *
     * Consumed, never recomputed. `resolveFamilyCollectible` is Thread 9's authority and already
     * carries Thread 8's outstanding predicate and the governed subsidy suppression inside it.
     * Re-deriving either here would create a second answer to "what may we take", and the two would
     * drift the first time a claim was submitted.
     *
     * Scoped by the SESSION's org, so a charge belonging to another tenant resolves to nothing —
     * which is what makes obligation and household substitution unreachable rather than merely
     * checked.
     */
    let collectible;
    try {
        collectible = await resolveFamilyCollectible(supabase, {
            orgId: input.orgId,
            chargeId: input.chargeId,
        });
    } catch {
        return {
            ok: false,
            reason: "charge_not_found",
            message: "That obligation could not be resolved for this organization.",
        };
    }

    if (collectible.currentlyCollectibleCents <= 0) {
        return {
            ok: false,
            reason: "charge_not_collectible",
            message:
                "Nothing is currently collectible on this obligation — it may be settled, or covered by a submitted subsidy claim.",
        };
    }

    // The ceiling is the canonical answer, and the operator's intent is measured against it. Asking
    // for more is refused rather than silently clamped: a clamp would take a different amount than
    // the operator authorised and tell nobody.
    if (input.requestedAmountCents > collectible.currentlyCollectibleCents) {
        return {
            ok: false,
            reason: "amount_exceeds_collectible",
            message: `The most that can be collected on this obligation right now is ${collectible.currentlyCollectibleCents} cents.`,
        };
    }

    // Currency comes from the obligation, never from the caller. Stripe would happily charge 5000 of
    // whatever unit it is told.
    const currency = (collectible.currencyCode || "USD").toUpperCase();
    if (currency !== "USD") {
        return {
            ok: false,
            reason: "currency_mismatch",
            message: `This collection path supports USD only; the obligation is denominated in ${currency}.`,
        };
    }

    // ── 3. THE CANONICAL ACCOUNT THE MONEY IS RECEIVED AGAINST ───────────────────────────────────
    const { data: chargeRow } = await supabase
        .from("charges")
        .select("billable_source_type, billable_source_id")
        .eq("org_id", input.orgId)
        .eq("id", input.chargeId)
        .maybeSingle();
    const source = chargeRow as { billable_source_type: string; billable_source_id: string } | null;
    if (!source) {
        return {
            ok: false,
            reason: "charge_not_found",
            message: "That obligation could not be resolved for this organization.",
        };
    }

    /*
     * ── 3b·W2. THE STORED METHOD, IF ONE WAS NAMED ───────────────────────────────────────────────
     *
     * Resolved against the CANONICAL table before anything is created, so a method that is revoked,
     * expired, awaiting verification or scoped to another family refuses here rather than at Stripe
     * — after the operator has been told a collection is under way.
     *
     * The clone happens immediately before the PaymentIntent and is never stored: Stripe consumes a
     * clone with the charge it serves. For a bank account the mandate travels with it, which is only
     * true because the authorization was taken on the platform without `on_behalf_of`.
     */
    let storedMethod: PaymentMethodRecord | null = null;
    let clonedMethodRef: string | null = null;
    if (t(input.paymentMethodId)) {
        /*
         * WHICH ACCOUNT THIS OBLIGATION BELONGS TO — resolved, not assumed.
         *
         * A charge's billable source is a `customer` for household-level obligations and an
         * `enrollment_agreement` for a child's. Only the first names the account directly, and an
         * earlier draft of this treated the second as "no account", which silently skipped the scope
         * check on the SHAPE production actually uses most. The agreement carries `customer_id`, so
         * it is looked up rather than given up on.
         */
        const accountCustomerId = await resolveChargeAccount(supabase, input.orgId, source);
        const resolution = await resolveCollectionMethod(supabase, {
            orgId: input.orgId,
            methodId: t(input.paymentMethodId),
            customerId: accountCustomerId,
        });
        if (!resolution.ok) {
            return {
                ok: false,
                reason:
                    resolution.reason === "not_found"
                        ? "method_not_found"
                        : resolution.reason === "wrong_account"
                            ? "method_wrong_account"
                            : "method_not_usable",
                message: resolution.message,
            };
        }
        storedMethod = resolution.method;

        /* Asking a bank method to settle a card collection is a different rail and a different cost. */
        if (storedMethod.rail !== rail) {
            return {
                ok: false,
                reason: "method_rail_mismatch",
                message:
                    storedMethod.rail === "ach"
                        ? "That stored method is a bank account, not a card."
                        : "That stored method is a card, not a bank account.",
            };
        }

        /*
         * ── THE PAYER INVARIANT (W3) ─────────────────────────────────────────────────────────────
         *
         * A stored method is OWNED by a payer. If the caller also names a payer, the two must agree:
         * charging Person B's card while recording Person A as the payer would put a receipt in the
         * ledger that says money came from someone it did not come from, and no later correction can
         * tell the two apart.
         *
         * Delegated use — B's card knowingly paying on A's behalf — is a real thing and the approved
         * domain does not model it yet, so it is REFUSED rather than silently permitted.
         *
         * This does not touch responsibility. Person B may own the card, pay with it, and owe
         * nothing; who owes is Thread 6's and is not written here.
         */
        if (
            t(input.payerPersonId)
            && storedMethod.payerEntityType === "person"
            && storedMethod.payerEntityId !== t(input.payerPersonId)
        ) {
            return {
                ok: false,
                reason: "method_payer_mismatch",
                message:
                    "That payment method belongs to a different payer. Collect with a method the named payer owns, "
                    + "or record the payment against its owner.",
            };
        }

        const materialized = await materializeMethodForMerchant(storedMethod, merchant.providerAccountRef);
        if (!materialized.ok) {
            return {
                ok: false,
                reason: "method_unavailable_at_provider",
                message: `That stored payment method could not be used with this merchant: ${materialized.message}`,
            };
        }
        clonedMethodRef = materialized.clonedMethodRef;
    }

    const intentKey = deriveIntentKey({
        chargeId: input.chargeId,
        amountCents: input.requestedAmountCents,
        rail,
    });

    /*
     * ── 4. ONE ATTEMPT PER INTENT ────────────────────────────────────────────────────────────────
     *
     * The insert races deliberately. Two concurrent submissions both reach here; the unique index on
     * (org_id, intent_key) lets exactly one win, and the loser reads the winner's row rather than
     * creating a second PaymentIntent. A read-then-insert would let both through.
     */
    const { data: created, error: insertError } = await supabase
        .from("payment_collection_attempts")
        .insert({
            org_id: input.orgId,
            processor: "stripe",
            merchant_id: merchant.merchantId,
            provider_account_ref: merchant.providerAccountRef,
            rail,
            billable_source_type: source.billable_source_type,
            billable_source_id: source.billable_source_id,
            charge_id: input.chargeId,
            /*
             * WHO ACTUALLY PAID. When a stored method is used and the caller named no payer, the
             * payer is the person whose instrument it was — that is the whole point of recording
             * ownership on the method. It is evidence, not authority: it never rewrites who is
             * RESPONSIBLE for the obligation, which is exactly the distinction this program keeps.
             *
             * A caller who names a payer wins, and an agency-owned method contributes nothing here
             * because `payer_person_id` is a person.
             */
            payer_person_id:
                t(input.payerPersonId)
                || (storedMethod?.payerEntityType === "person" ? storedMethod.payerEntityId : null)
                || null,
            currency,
            requested_amount_cents: input.requestedAmountCents,
            intent_key: intentKey,
            /*
             * W3 PROVENANCE. Which stored instrument this attempt used — durable, and never nulled
             * or repointed when the method is later revoked or replaced. The attempt names what
             * actually happened.
             */
            payment_method_id: storedMethod?.id ?? null,
            processor_state: "initiated",
            created_by: input.actorUserId ?? null,
            updated_by: input.actorUserId ?? null,
        })
        .select("id, provider_transaction_id")
        .single();

    let attemptId: string;
    let existingTxn: string | null = null;
    let reused = false;

    if (insertError) {
        if (!String(insertError.message).includes("uq_payment_collection_attempts_org_intent")) {
            throw new Error(`could not open a collection attempt: ${insertError.message}`);
        }
        const { data: winner } = await supabase
            .from("payment_collection_attempts")
            .select("id, provider_transaction_id")
            .eq("org_id", input.orgId)
            .eq("intent_key", intentKey)
            .single();
        const row = winner as { id: string; provider_transaction_id: string | null };
        attemptId = row.id;
        existingTxn = row.provider_transaction_id;
        reused = true;
    } else {
        const row = created as unknown as { id: string; provider_transaction_id: string | null };
        attemptId = row.id;
        existingTxn = row.provider_transaction_id;
    }

    /*
     * ── 4b. THE RACE LOSER MUST NOT CALL STRIPE ──────────────────────────────────────────────────
     *
     * Winning the index is only half of it. Certification caught the other half: both concurrent
     * requests went on to call Stripe with the same idempotency key, and Stripe answered the second
     * one with "another in-progress request using this Idempotent Key" — an error, not a convergence.
     * Relying on the provider to arbitrate a race Alloy already resolved is not idempotency.
     *
     * So: if this intent already has a PaymentIntent, return it and make no call at all. If it does
     * not, the winner is mid-flight — wait briefly for the id it is about to write rather than
     * racing it. Only a genuinely abandoned attempt (no id after the window) falls through to
     * create one, which is what makes a crashed first request recoverable instead of permanently
     * stuck.
     */
    if (existingTxn) {
        return await describeExistingAttempt(supabase, attemptId, existingTxn, merchant.providerAccountRef, input, currency);
    }

    if (reused) {
        for (let i = 0; i < 10; i += 1) {
            await new Promise((r) => setTimeout(r, 150));
            const { data: polled } = await supabase
                .from("payment_collection_attempts")
                .select("provider_transaction_id")
                .eq("id", attemptId)
                .single();
            const txn = (polled as { provider_transaction_id: string | null } | null)?.provider_transaction_id;
            if (txn) {
                return await describeExistingAttempt(supabase, attemptId, txn, merchant.providerAccountRef, input, currency);
            }
        }
    }

    /*
     * ── 5. THE PAYMENTINTENT, ON THE CONNECTED ACCOUNT ───────────────────────────────────────────
     *
     * `Stripe-Account` is what makes this a DIRECT charge: the provider is the merchant, the funds
     * settle to them, and Alloy never becomes merchant of record. There is no branch here that omits
     * it — the header is built from the resolved merchant, so a missing merchant means no call at
     * all rather than a call against the platform.
     *
     * `Idempotency-Key` is Alloy's intent key, so even a retry that reaches Stripe returns the same
     * PaymentIntent rather than charging twice.
     */
    const stripeResponse = await stripeCall(
        "payment_intents",
        {
            amount: String(input.requestedAmountCents),
            currency: currency.toLowerCase(),
            /*
             * The rail decides how the provider is asked.
             *
             * Card keeps the automatic methods it has always used. ACH names `us_bank_account`
             * explicitly, because an automatic list would let the provider settle a bank collection
             * onto a card — a different rail, a different cost, and not the one the operator chose.
             */
            ...(rail === "ach"
                ? { "payment_method_types[]": "us_bank_account" }
                : { "automatic_payment_methods[enabled]": "true" }),
            /*
             * A STORED METHOD IS CONFIRMED HERE, not in the browser — there is no payer present to
             * confirm it. `off_session` is the truthful statement of that, and it is what the setup
             * declared when the method was saved.
             *
             * This is the same call, in the same function, on the same connected account. There is
             * no second PaymentIntent path: the only difference is three parameters.
             */
            ...(clonedMethodRef
                ? { payment_method: clonedMethodRef, off_session: "true", confirm: "true" }
                : {}),
            /*
             * W3 — ask for the provider's own expected settlement date in the SAME call.
             *
             * `balance_transaction.available_on` is Stripe's statement of when the net funds become
             * available. It is the only date here that is the provider's rather than Alloy's guess,
             * which is why the projection maps it and nothing else. A card charge normally has no
             * meaningful one, and null is the correct answer there.
             */
            "expand[]": "latest_charge.balance_transaction",
            // Correlation only. Tenancy is resolved from the connected account through
            // payment_provider_merchants; metadata is never read as authority.
            "metadata[alloy_attempt_id]": attemptId,
            "metadata[alloy_org_id]": input.orgId,
            "metadata[alloy_charge_id]": input.chargeId,
        },
        {
            "Stripe-Account": merchant.providerAccountRef,
            "Idempotency-Key": `${input.orgId}:${intentKey}`,
        },
    );

    if (stripeResponse.status !== 200) {
        const err = (stripeResponse.body.error ?? {}) as { message?: string };
        throw new Error(`Stripe refused the collection request: ${err.message ?? stripeResponse.status}`);
    }

    const intent = stripeResponse.body as {
        id?: string;
        client_secret?: string;
        status?: string;
        next_action?: { type?: string } | null;
        latest_charge?: { balance_transaction?: { available_on?: number } | string | null } | string | null;
    };
    const providerTransactionId = String(intent.id ?? "");
    const clientSecret = String(intent.client_secret ?? "");

    // Stripe's own first answer, recorded as processor state — never as a receipt status.
    const providerState = mapStripeStatus(intent.status);
    /*
     * WHY action is required, when it is. A bank debit answering `requires_action` with
     * `verify_with_microdeposits` is waiting days on a verification, not offering a challenge the
     * payer can finish now, and an operator told "action required" for that would go looking for a
     * button nobody has. Presentation reads this; nothing financial depends on it.
     */
    const providerActionType = intent.next_action?.type ? String(intent.next_action.type) : null;

    await supabase
        .from("payment_collection_attempts")
        .update({
            provider_transaction_id: providerTransactionId,
            processor_state: providerState,
            provider_action_type: providerActionType,
            /* Projection only. Null when the provider offered no date — see the column comment. */
            expected_settlement_on: expectedSettlementFromIntent(intent),
            processor_state_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by: input.actorUserId ?? null,
        })
        .eq("id", attemptId);

    return {
        ok: true,
        attemptId,
        providerTransactionId,
        clientSecret,
        connectedAccountRef: merchant.providerAccountRef,
        amountCents: input.requestedAmountCents,
        currency,
        reused: reused || Boolean(existingTxn),
        paymentMethodId: storedMethod?.id ?? null,
    };
}

/**
 * Stripe's PaymentIntent status, mapped onto the attempt vocabulary.
 *
 * `requires_capture` folds into `processing`: the money is authorised but not taken, which is
 * emphatically not cash. Anything unrecognised also folds into `processing` rather than defaulting
 * to a terminal state — an unknown provider status must never be read as success.
 */
/**
 * THE PROVIDER'S OWN EXPECTED SETTLEMENT DATE, or null.
 *
 * Read from `latest_charge.balance_transaction.available_on`, which Stripe defines as the date the
 * transaction's net funds become available. Returned as a DAY, because that is what an operator
 * tells a family and what the column stores — a moment would imply a precision the rail does not
 * have.
 *
 * Null whenever the provider did not supply one, which includes every card charge that settles
 * immediately and any response where the charge was not expanded. **Null is a correct answer, not a
 * missing one**, and nothing financial reads this either way.
 */
export function expectedSettlementFromIntent(intent: {
    latest_charge?: { balance_transaction?: { available_on?: number } | string | null } | string | null;
}): string | null {
    const charge = intent.latest_charge;
    if (!charge || typeof charge === "string") return null;
    const bt = charge.balance_transaction;
    if (!bt || typeof bt === "string") return null;
    const availableOn = bt.available_on;
    if (!Number.isFinite(availableOn) || Number(availableOn) <= 0) return null;
    return new Date(Number(availableOn) * 1000).toISOString().slice(0, 10);
}

export function mapStripeStatus(status: string | undefined): string {
    switch (status) {
        case "requires_payment_method":
            return "requires_payment_method";
        case "requires_action":
        case "requires_confirmation":
            return "requires_action";
        case "succeeded":
            return "succeeded";
        case "canceled":
            return "canceled";
        case "processing":
        case "requires_capture":
            return "processing";
        default:
            return "processing";
    }
}
