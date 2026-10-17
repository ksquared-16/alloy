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
    /**
     * THE CALLER'S COMMAND IDENTITY — which deliberate request this is (`payload.idempotency_key`,
     * the convention `payment.record` already uses).
     *
     * The derived intent key cannot tell a network retry of one command from a second, intentional
     * payment of the same amount by the same payer with the same method on the same day: both look
     * identical. A command key can. The same key is the same command — retried as often as the
     * network needs, it returns the same attempt, succeeded or not. A different key is a different
     * payment and opens its own attempt.
     *
     * Absent, a match on an attempt that already SUCCEEDED is refused as `already_collected` rather
     * than handed back as though it were this request's: nothing new is charged, and nothing is
     * silently reused.
     */
    commandKey?: string | null;
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
    | "method_payer_mismatch"
    /* The named payer is not a person in this organization. */
    | "payer_not_found"
    /* The provider declined a stored method. The attempt is recorded, terminal, and retryable. */
    | "payment_declined"
    /*
     * A declined attempt could not be retired at the provider because it has moved on — usually a
     * payer who re-entered a card in a tab that was still open. Its outcome must land before a new
     * attempt may be opened, or the same person could be charged twice.
     */
    | "previous_attempt_unresolved"
    /* One payer has had more declined attempts at this exact intent today than a retry warrants. */
    | "too_many_attempts"
    /*
     * The same payer already paid this exact amount, with this method, on this charge today, and no
     * command identity says this request is a different payment. Nothing new was started.
     */
    | "already_collected"
    /* A command identity was supplied but is not a usable one. */
    | "invalid_command_key";

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
    | {
          ok: false;
          reason: CollectionRefusalReason;
          message: string;
          /** The attempt the refusal is about, when one exists — a recorded decline has one. */
          attemptId?: string;
      };

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

/**
 * WHO an attempt is for, as the intent key names it.
 *
 * The canonical payer when there is one — a person resolved server-side, never a name or an email.
 * When nobody is named (an operator collecting at the desk), the operator who asked stands in for
 * the payer, so two operators taking two cards are two attempts rather than one shared session.
 */
export function attemptPayerKey(input: { payerPersonId?: string | null; actorUserId?: string | null }): string {
    if (t(input.payerPersonId)) return `person:${t(input.payerPersonId)}`;
    if (t(input.actorUserId)) return `actor:${t(input.actorUserId)}`;
    return "unattributed";
}

/**
 * The intent key — and why the payer and the method are in it.
 *
 * TWO PAYERS ARE TWO PAYMENTS. The key used to be charge, amount, rail and day, and two parents
 * paying the same fee from their own links on the same day produced the same key — so the second
 * parent was handed the FIRST parent's PaymentIntent and its client secret. Nothing about that is a
 * retry. The payer is part of what makes an intent the same intent, and so is the stored method: the
 * same person paying with a different instrument is a different request of the provider.
 *
 * `v2` separates these keys from every key minted before the payer was part of them, so a historical
 * attempt can never be mistaken for a current one; historical attempts stay reachable exactly as
 * before, by their id and by their provider transaction.
 *
 * GENERATION is the retry after a terminal outcome. Generation 0 is the first attempt; a declined or
 * canceled attempt is never handed out again, and the next request opens generation 1 under its own
 * key — which is also its own provider idempotency key, so the provider cannot replay the decline.
 */
export function deriveIntentKey(input: {
    chargeId: string;
    amountCents: number;
    rail: string;
    day?: string;
    payerKey?: string;
    paymentMethodId?: string | null;
    generation?: number;
    commandKey?: string | null;
}): string {
    const day = input.day ?? new Date().toISOString().slice(0, 10);
    const parts = [
        "collect",
        "v2",
        input.chargeId,
        String(input.amountCents),
        input.rail,
        input.payerKey || "unattributed",
        t(input.paymentMethodId) ? `method:${t(input.paymentMethodId)}` : "present",
        day,
    ];
    // Hashed, not embedded: the intent key is also the provider idempotency key, which Stripe caps at
    // 255 characters, and a caller's command identity has no business being readable in it.
    if (t(input.commandKey)) parts.push(`cmd:${commandDigest(t(input.commandKey))}`);
    const generation = Math.max(0, Math.floor(input.generation ?? 0));
    if (generation > 0) parts.push(`g${generation}`);
    return parts.join(":");
}

/**
 * A short, stable digest of a command key (two FNV-1a passes, 64 bits as hex).
 *
 * Pure arithmetic rather than `node:crypto`: this module is reachable from the action registry, which
 * reaches the client bundle. Collisions only matter between two commands of one payer, one charge,
 * one amount, one method and one day, where 64 bits is far beyond enough.
 */
export function commandDigest(value: string): string {
    let a = 0x811c9dc5;
    let b = 0x01000193 ^ 0x9e3779b9;
    for (let i = 0; i < value.length; i += 1) {
        const c = value.charCodeAt(i);
        a = Math.imul(a ^ c, 0x01000193) >>> 0;
        b = Math.imul(b ^ c ^ (i & 0xff), 0x01000193) >>> 0;
    }
    return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/** A command key is opaque but bounded: 8–200 printable characters, no whitespace. */
const COMMAND_KEY_SHAPE = /^[\x21-\x7e]{8,200}$/;

/** Provider outcomes an attempt never comes back from. A new request opens a new attempt. */
export const RETIRED_ATTEMPT_STATES: ReadonlySet<string> = new Set(["failed", "canceled"]);

/** Bounded: a person retrying a declined card this many times today is not retrying any more. */
const MAX_ATTEMPT_GENERATIONS = 10;

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

/** A provider read, on a connected account. Injected by tests; real Stripe otherwise. */
export type StripeRead = (
    path: string,
    connectedAccountRef: string,
) => Promise<{ status: number; body: Record<string, unknown> }>;

const defaultStripeRead: StripeRead = async (path, connectedAccountRef) => {
    const secret = process.env.STRIPE_SECRET_KEY ?? "";
    if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured for this runtime");
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
        headers: { Authorization: `Bearer ${secret}`, "Stripe-Account": connectedAccountRef },
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

/** The columns a reused attempt is judged by. */
type ExistingAttempt = {
    id: string;
    provider_transaction_id: string | null;
    processor_state: string;
    payer_person_id: string | null;
    payment_method_id: string | null;
    provider_account_ref: string;
    created_by: string | null;
};

const EXISTING_ATTEMPT_COLUMNS =
    "id, provider_transaction_id, processor_state, payer_person_id, payment_method_id, provider_account_ref, created_by";

/**
 * An attempt that already has a PaymentIntent, described without creating anything.
 *
 * The client secret is re-read from Stripe rather than stored: it is the browser's handle on the
 * intent, and keeping a copy in Alloy's database would be storing a credential-shaped value for no
 * reason. Read on the CONNECTED account, because that is where the intent lives.
 *
 * Only ever called for an attempt whose payer is THIS request's payer — see `payerOwnsAttempt`.
 */
async function describeExistingAttempt(
    supabase: SupabaseClient,
    existing: ExistingAttempt,
    providerTransactionId: string,
    connectedAccountRef: string,
    input: CreateCardCollectionInput,
    currency: string,
    stripeRead: StripeRead,
): Promise<CreateCardCollectionResult> {
    const res = await stripeRead(`payment_intents/${encodeURIComponent(providerTransactionId)}`, connectedAccountRef);
    const body = res.body as { client_secret?: string; status?: string };

    if (res.status === 200 && body.status) {
        // Keep the projection honest even on a pure retry: the provider may have moved on since the
        // row was last written, and a retry is a perfectly good moment to notice.
        await supabase
            .from("payment_collection_attempts")
            .update({
                processor_state: mapStripeStatus(body.status),
                processor_state_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .neq("processor_state", mapStripeStatus(body.status));
    }

    return {
        ok: true,
        attemptId: existing.id,
        providerTransactionId,
        clientSecret: String(body.client_secret ?? ""),
        connectedAccountRef,
        amountCents: input.requestedAmountCents,
        currency,
        reused: true,
        /*
         * The stored method the ORIGINAL attempt used. This was omitted, so a reused stored-method
         * attempt looked like a present-payer one and the operator surface opened card entry for a
         * card that had already been charged off-session.
         */
        paymentMethodId: existing.payment_method_id ?? null,
    };
}

/**
 * Whether the attempt a key resolved to really is this payer's.
 *
 * The key already contains the payer, so a mismatch means a key was reached some other way — a
 * hand-built key, a historical row. Handing out that attempt's session would give one payer another
 * payer's credentials, so it is checked rather than assumed.
 */
function payerOwnsAttempt(
    existing: ExistingAttempt,
    payerPersonId: string | null,
    actorUserId: string | null,
): boolean {
    if (payerPersonId) return t(existing.payer_person_id) === payerPersonId;
    if (t(existing.payer_person_id)) return false;
    return t(existing.created_by) === t(actorUserId);
}

/**
 * RETIRE A DECLINED ATTEMPT AT THE PROVIDER before a new one is opened.
 *
 * A declined PaymentIntent is not dead at Stripe — it sits in `requires_payment_method`, and the tab
 * that holds its client secret can still confirm it with another card. Opening a second attempt
 * beside it would leave two live intents for one payment. So the old one is canceled first; its
 * attempt keeps `failed`, which is what happened to it.
 *
 * If the provider says it has moved on (`processing`, `succeeded`), the old attempt is NOT retired
 * and no new one is opened: its money is on the way, and the webhook or recognition will post it.
 */
async function retireDeclinedIntent(
    existing: ExistingAttempt,
    stripeCall: StripeCall,
    stripeRead: StripeRead,
): Promise<{ ok: true } | { ok: false; providerStatus: string }> {
    const pi = t(existing.provider_transaction_id);
    if (!pi || existing.processor_state === "canceled") return { ok: true };

    const cancel = await stripeCall(
        `payment_intents/${encodeURIComponent(pi)}/cancel`,
        { cancellation_reason: "abandoned" },
        { "Stripe-Account": existing.provider_account_ref },
    );
    if (cancel.status === 200) return { ok: true };

    // Not cancelable. Ask what it IS rather than guessing from the error text.
    const read = await stripeRead(`payment_intents/${encodeURIComponent(pi)}`, existing.provider_account_ref);
    const status = String((read.body as { status?: unknown }).status ?? "");
    if (read.status === 200 && status === "canceled") return { ok: true };
    return { ok: false, providerStatus: status || `unreadable (${read.status})` };
}

/**
 * A provider refusal of an off-session confirmation, as Stripe reports it: an HTTP 402 whose error
 * carries the PaymentIntent it created. Null when the error is anything else.
 */
function declinedIntentFrom(response: { status: number; body: Record<string, unknown> }): {
    intentId: string;
    intentStatus: string;
    code: string | null;
    declineCode: string | null;
    message: string | null;
} | null {
    if (response.status === 200) return null;
    const err = (response.body.error ?? {}) as {
        code?: unknown;
        decline_code?: unknown;
        message?: unknown;
        payment_intent?: { id?: unknown; status?: unknown } | null;
    };
    const intentId = t(err.payment_intent?.id);
    if (!intentId) return null;
    return {
        intentId,
        intentStatus: t(err.payment_intent?.status),
        code: t(err.code) || null,
        declineCode: t(err.decline_code) || null,
        message: t(err.message) || null,
    };
}

export async function createCardCollection(
    supabase: SupabaseClient,
    input: CreateCardCollectionInput,
    stripeCall: StripeCall = defaultStripeCall,
    stripeRead: StripeRead = defaultStripeRead,
): Promise<CreateCardCollectionResult> {
    const rail = input.rail ?? "card";

    if (!Number.isInteger(input.requestedAmountCents) || input.requestedAmountCents <= 0) {
        return {
            ok: false,
            reason: "invalid_amount",
            message: "A collection amount must be a positive whole number of cents.",
        };
    }

    /*
     * ── 0. THE NAMED PAYER IS A PERSON IN THIS ORGANIZATION ──────────────────────────────────────
     *
     * The payer is part of the attempt's identity and is written onto the receipt, so it is checked
     * against the canonical person record rather than carried through on a caller's say-so. Scoped
     * by the session's org: a person in another tenant reads as absent.
     */
    const commandKey = t(input.commandKey) || null;
    if (commandKey && !COMMAND_KEY_SHAPE.test(commandKey)) {
        return {
            ok: false,
            reason: "invalid_command_key",
            message: "The request identity must be 8 to 200 visible characters.",
        };
    }

    const namedPayer = t(input.payerPersonId) || null;
    if (namedPayer) {
        const { data: person } = await supabase
            .from("persons")
            .select("id")
            .eq("org_id", input.orgId)
            .eq("id", namedPayer)
            .maybeSingle();
        if (!person) {
            return {
                ok: false,
                reason: "payer_not_found",
                message: "The payer named for this collection is not a person in this organization.",
            };
        }
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
        /*
         * An obligation whose account cannot be resolved has nothing to scope a stored method to,
         * and "we could not tell whose this is" must not open the gate. A present-payer collection
         * is unaffected; only charging an instrument on file needs to know whose file.
         */
        if (!accountCustomerId) {
            return {
                ok: false,
                reason: "method_wrong_account",
                message: "This obligation's account could not be resolved, so no stored method can be used for it.",
            };
        }
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
        /*
         * With a payer named, ONLY that person's own method qualifies. An agency-owned method used
         * to pass this check because it is not a person — so a participant link could charge a
         * method that belonged to nobody it named.
         */
        if (
            namedPayer
            && (storedMethod.payerEntityType !== "person" || storedMethod.payerEntityId !== namedPayer)
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

    /*
     * WHO IS PAYING, settled once. A caller who names a payer wins; otherwise a stored method's
     * owner is the payer, because that is whose money it is. Evidence only — it never rewrites who
     * is RESPONSIBLE for the obligation.
     */
    const payerPersonId =
        namedPayer
        || (storedMethod?.payerEntityType === "person" ? storedMethod.payerEntityId : null)
        || null;
    const actorUserId = t(input.actorUserId) || null;
    const payerKey = attemptPayerKey({ payerPersonId, actorUserId });
    const keyFor = (generation: number) =>
        deriveIntentKey({
            chargeId: input.chargeId,
            amountCents: input.requestedAmountCents,
            rail,
            payerKey,
            paymentMethodId: storedMethod?.id ?? null,
            generation,
            commandKey,
        });
    const baseKey = keyFor(0);
    /* This request's own attempts: its key, and the retry generations after a decline. */
    const isOwnAttemptKey = (key: string) =>
        key === baseKey
        || (key.startsWith(`${baseKey}:g`) && /^\d+$/.test(key.slice(baseKey.length + 2)));

    /*
     * ── 3c. MONEY ALREADY ON ITS WAY COUNTS AGAINST THE CEILING ──────────────────────────────────
     *
     * The collectible ceiling is Financials' and counts only recognised money. A bank debit that is
     * `processing` for three days, or a card the provider has taken that is not posted yet, is not
     * in it — so a second payer could be asked for the whole balance while the first payer's money
     * was still in flight, and the family would pay twice. Those attempts are subtracted here.
     *
     * This narrows what may be ASKED for; it never changes what is owed. The ledger's own allocation
     * bound is still what guarantees a charge is never over-applied when two payments race. This
     * request's own earlier attempts (same payer, same intent) are excluded, so a genuine retry is
     * still a retry rather than a refusal.
     */
    const { data: inFlightRows } = await supabase
        .from("payment_collection_attempts")
        .select("intent_key, processor_state, canonical_payment_id, requested_amount_cents")
        .eq("org_id", input.orgId)
        .eq("charge_id", input.chargeId)
        .in("processor_state", ["processing", "succeeded"])
        .is("canonical_payment_id", null);
    const inFlightCents = ((inFlightRows ?? []) as Array<{ intent_key: string; requested_amount_cents: number }>)
        .filter((r) => !isOwnAttemptKey(String(r.intent_key)))
        .reduce((sum, r) => sum + (Number(r.requested_amount_cents) || 0), 0);
    if (inFlightCents > 0 && input.requestedAmountCents > collectible.currentlyCollectibleCents - inFlightCents) {
        const room = Math.max(0, collectible.currentlyCollectibleCents - inFlightCents);
        return {
            ok: false,
            reason: "amount_exceeds_collectible",
            message: room > 0
                ? `Another payment of ${inFlightCents} cents on this obligation is still settling. The most that can be collected now is ${room} cents.`
                : "Another payment on this obligation is still settling and covers what is owed. Nothing more can be collected until it lands.",
        };
    }

    /*
     * ── 4. ONE ATTEMPT PER INTENT, AND A NEW ONE AFTER A TERMINAL OUTCOME ────────────────────────
     *
     * The insert races deliberately. Two concurrent submissions both reach here; the unique index on
     * (org_id, intent_key) lets exactly one win, and the loser reads the winner's row rather than
     * creating a second PaymentIntent. A read-then-insert would let both through.
     *
     * THE ATTEMPT LIFECYCLE:
     *
     *   initiated → requires_payment_method / requires_action / processing → succeeded
     *                                                                       ↘ failed   (declined)
     *                                                                       ↘ canceled
     *
     *   • A NON-TERMINAL attempt is reused: that is a network retry, a second tab, a double click.
     *   • A SUCCEEDED attempt is reused: asking again must never charge again.
     *   • A FAILED or CANCELED attempt is NEVER reused. It used to be — a declined card's retry
     *     received the declined intent back, and when that intent later succeeded the webhook
     *     refused to post it because the attempt "was terminal". Now the declined intent is retired
     *     at the provider and the next generation opens its own attempt. The failed one keeps its
     *     history and its state.
     */
    let attemptId = "";
    let existingTxn: string | null = null;
    let reused = false;
    let intentKey = baseKey;
    let reusedRow: ExistingAttempt | null = null;

    for (let generation = 0; ; generation += 1) {
        if (generation >= MAX_ATTEMPT_GENERATIONS) {
            return {
                ok: false,
                reason: "too_many_attempts",
                message: "This payment has been declined too many times today. Try a different payment method or try again tomorrow.",
            };
        }
        intentKey = keyFor(generation);

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
                payer_person_id: payerPersonId,
                currency,
                requested_amount_cents: input.requestedAmountCents,
                intent_key: intentKey,
                /*
                 * W3 PROVENANCE. Which stored instrument this attempt used — durable, and never
                 * nulled or repointed when the method is later revoked or replaced.
                 */
                payment_method_id: storedMethod?.id ?? null,
                processor_state: "initiated",
                created_by: actorUserId,
                updated_by: actorUserId,
            })
            .select("id, provider_transaction_id")
            .single();

        if (!insertError) {
            const row = created as unknown as { id: string; provider_transaction_id: string | null };
            attemptId = row.id;
            existingTxn = row.provider_transaction_id;
            break;
        }

        if (!String(insertError.message).includes("uq_payment_collection_attempts_org_intent")) {
            throw new Error(`could not open a collection attempt: ${insertError.message}`);
        }
        const { data: winner } = await supabase
            .from("payment_collection_attempts")
            .select(EXISTING_ATTEMPT_COLUMNS)
            .eq("org_id", input.orgId)
            .eq("intent_key", intentKey)
            .single();
        const row = winner as unknown as ExistingAttempt | null;
        if (!row) throw new Error("could not read the collection attempt that already holds this intent");

        if (!payerOwnsAttempt(row, payerPersonId, actorUserId)) {
            // Never hand one payer another payer's session — not even on a key collision.
            throw new Error("a collection attempt for this intent belongs to a different payer; refusing to reuse it");
        }

        /*
         * A SUCCEEDED match with no command identity. It might be a network retry of the request
         * that succeeded, or a deliberate second payment of the same amount — and the two cannot be
         * told apart. Handing back the old transaction would silently swallow the second payment;
         * charging again would double-charge the retry. So neither: the caller is told, and a
         * deliberate repeat is made with a command key.
         */
        if (row.processor_state === "succeeded" && !commandKey) {
            return {
                ok: false,
                reason: "already_collected",
                attemptId: row.id,
                message:
                    "This payer already paid this exact amount on this obligation today, so nothing new was started. "
                    + "To make another payment of the same amount, submit it as a new payment.",
            };
        }

        if (!RETIRED_ATTEMPT_STATES.has(row.processor_state)) {
            attemptId = row.id;
            existingTxn = row.provider_transaction_id;
            reused = true;
            reusedRow = row;
            break;
        }

        // A terminal failure: retire its intent at the provider, then open the next generation.
        const retired = await retireDeclinedIntent(row, stripeCall, stripeRead);
        if (!retired.ok) {
            return {
                ok: false,
                reason: "previous_attempt_unresolved",
                attemptId: row.id,
                message:
                    retired.providerStatus === "succeeded" || retired.providerStatus === "processing"
                        ? "An earlier try at this payment went through after it was declined, and is being recorded now. Nothing new was started."
                        : "An earlier try at this payment could not be closed with the provider, so a new one was not started. Try again shortly.",
            };
        }
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
    if (existingTxn && reusedRow) {
        return await describeExistingAttempt(
            supabase, reusedRow, existingTxn, merchant.providerAccountRef, input, currency, stripeRead,
        );
    }

    if (reused && reusedRow) {
        for (let i = 0; i < 10; i += 1) {
            await new Promise((r) => setTimeout(r, 150));
            const { data: polled } = await supabase
                .from("payment_collection_attempts")
                .select("provider_transaction_id, processor_state")
                .eq("id", attemptId)
                .single();
            const p = polled as { provider_transaction_id: string | null; processor_state: string } | null;
            if (p?.processor_state === "failed" && p.provider_transaction_id) {
                // The winner's stored-method charge was declined while we waited. Same answer.
                return declinedRefusal(attemptId, null, rail);
            }
            if (p?.provider_transaction_id) {
                return await describeExistingAttempt(
                    supabase, reusedRow, p.provider_transaction_id, merchant.providerAccountRef, input, currency, stripeRead,
                );
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

    /*
     * ── 5b. A DECLINE IS AN OUTCOME, NOT AN EXCEPTION ────────────────────────────────────────────
     *
     * A stored method is confirmed in this call, so the provider's refusal arrives HERE — as a 402
     * carrying the PaymentIntent it created. This used to throw. The attempt was left `initiated`
     * with no provider id: the webhook that followed could not find it, the operator surface read
     * it as "Processing" indefinitely, and the declined card looked like money on its way.
     *
     * Now the intent is recorded and the attempt is `failed` — terminal, kept, and never reused, so
     * the next request opens a fresh attempt. Bounded provider detail only; never card data.
     */
    const declined = declinedIntentFrom(stripeResponse);
    if (declined && (declined.intentStatus === "requires_payment_method" || declined.intentStatus === "canceled")) {
        await supabase
            .from("payment_collection_attempts")
            .update({
                provider_transaction_id: declined.intentId,
                processor_state: "failed",
                processor_state_at: new Date().toISOString(),
                last_provider_detail: {
                    source: "confirm",
                    status: declined.intentStatus,
                    failure_code: declined.code,
                    decline_code: declined.declineCode,
                },
                updated_at: new Date().toISOString(),
                updated_by: actorUserId,
            })
            .eq("id", attemptId);
        return declinedRefusal(attemptId, declined.message, rail);
    }

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
            updated_by: actorUserId,
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

/** What a payer or operator is told when a stored method is declined. Nothing was collected. */
function declinedRefusal(attemptId: string, providerMessage: string | null, rail: "card" | "ach"): CreateCardCollectionResult {
    const lead = providerMessage || (rail === "ach" ? "The bank account was declined." : "The card was declined.");
    return {
        ok: false,
        reason: "payment_declined",
        attemptId,
        message: `${lead} Nothing was collected and the balance is unchanged. You can try again or use a different payment method.`,
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
