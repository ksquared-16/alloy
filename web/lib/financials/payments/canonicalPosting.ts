/**
 * SLICE F — THE AUTHORITY BOUNDARY, crossed exactly once.
 *
 * Everything up to here has been evidence: Stripe said it collected, the signature was real, the
 * connected account resolved to a tenant, the attempt converged. None of it was money. This module
 * is the single place that turns it into money, and it does so by CALLING Thread 8 rather than by
 * reproducing it.
 *
 * Nothing here computes a balance, an allocation, an unapplied remainder or a journal line.
 * `recordAndApplyChildcarePayment` owns all of that and already emits the Thread 5 consequence
 * itself (`paymentReceivedEntry` and `paymentAppliedEntry` are called inside it), so the accounting
 * follows from the canonical receipt rather than from anything Stripe-shaped. That is the ownership
 * the Director set: Stripe → evidence, Thread 8 → receipt and application, Thread 5 → journal.
 *
 * ── WHY THE ATTEMPT IS THE IDEMPOTENCY ANCHOR ──
 *
 * Not the Stripe event id: a second, differently-identified event can describe the same succeeded
 * PaymentIntent, and event-level dedupe would let it through. Not the browser's request id: it is a
 * request identifier, not an authority. The canonical processor attempt is the thing that is one
 * collection, so it is what final money idempotency hangs on — and it is enforced twice, by
 * `payments.idempotency_key` derived from it and by the unique index on
 * `payment_collection_attempts.canonical_payment_id`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAndApplyChildcarePayment } from "@/lib/financials/childcarePaymentService";

export type PostingOutcome =
    | { posted: true; paymentId: string; alreadyRecorded: boolean; appliedCents: number }
    | { posted: false; reason: "already_posted"; paymentId: string }
    | { posted: false; reason: "amount_mismatch" | "currency_mismatch" | "not_succeeded"; detail: string }
    | { posted: false; reason: "posting_failed"; detail: string };

export type AttemptForPosting = {
    id: string;
    org_id: string;
    charge_id: string | null;
    currency: string;
    requested_amount_cents: number;
    payer_person_id: string | null;
    provider_transaction_id: string | null;
    processor_state: string;
    canonical_payment_id: string | null;
    /**
     * Which rail the money actually came down. Nullable because every attempt written before
     * Thread 8C predates the column, and all of those were card — the only rail that existed.
     */
    rail: string | null;
};

/**
 * The rail, in Thread 8's payment-method vocabulary.
 *
 * The two vocabularies happen to agree today (`card` → `card`, `ach` → `ach`), and the mapping is
 * written out anyway: they are owned by different threads and are free to diverge, and an implicit
 * pass-through would turn that divergence into a wrong receipt rather than a type error. An
 * unrecognised or absent rail falls back to `card`, which is what every pre-8C attempt is.
 */
function railPaymentMethod(rail: string | null): "card" | "ach" {
    return rail === "ach" ? "ach" : "card";
}

/** The Thread 8 idempotency key for one collection. Derived, stable, and never a delivery id. */
export function postingIdempotencyKey(attemptId: string): string {
    return `stripe-collection:${attemptId}`;
}

/**
 * Recognise a provider-confirmed collection as canonical money, at most once.
 *
 * `providerAmountCents` and `providerCurrency` are what the PROVIDER says it took. They are compared
 * with what Alloy authorised rather than trusted over it or ignored in its favour: a disagreement
 * means the collection evidence and the financial intent describe different events, and posting
 * either number would be a guess about a family's money. It refuses and records why.
 */
export async function postProviderConfirmedCollection(
    supabase: SupabaseClient,
    attempt: AttemptForPosting,
    provider: { amountCents: number | null; currency: string | null },
): Promise<PostingOutcome> {
    if (attempt.processor_state !== "succeeded") {
        return { posted: false, reason: "not_succeeded", detail: `attempt is ${attempt.processor_state}` };
    }

    // Already recognised. The cheap read that makes the common duplicate case free; the unique index
    // below is what makes it CORRECT when two deliveries pass this check simultaneously.
    if (attempt.canonical_payment_id) {
        return { posted: false, reason: "already_posted", paymentId: attempt.canonical_payment_id };
    }

    if (!attempt.charge_id) {
        return { posted: false, reason: "posting_failed", detail: "attempt names no obligation to apply to" };
    }

    // ── F5. Neither side wins a disagreement; the disagreement itself is the finding. ────────────
    if (provider.amountCents != null && provider.amountCents !== attempt.requested_amount_cents) {
        return {
            posted: false,
            reason: "amount_mismatch",
            detail: `provider collected ${provider.amountCents} but Alloy authorised ${attempt.requested_amount_cents}`,
        };
    }
    if (provider.currency && provider.currency.toUpperCase() !== attempt.currency.toUpperCase()) {
        return {
            posted: false,
            reason: "currency_mismatch",
            detail: `provider currency ${provider.currency} does not match the authorised ${attempt.currency}`,
        };
    }

    let result;
    try {
        result = await recordAndApplyChildcarePayment(supabase, {
            orgId: attempt.org_id,
            chargeId: attempt.charge_id,
            amountCents: attempt.requested_amount_cents,
            // The rail is how value was tendered; the processor is who executed it. Both are recorded,
            // and neither is the other.
            //
            // This read `"card"` until Thread 8C, which was true while card was the only rail and
            // silently wrong the moment a bank debit settled: certification found a receipt for a
            // real ACH collection filed as a card payment. The receipt is what an operator reconciles
            // against a bank statement, so the rail has to survive recognition, not just authorisation.
            paymentMethod: railPaymentMethod(attempt.rail),
            processor: "stripe",
            processorTransactionId: attempt.provider_transaction_id,
            /*
             * WHO ACTUALLY PAID, when the collection knew. Evidence only — Thread 6 owns
             * responsibility, and a grandparent paying a fee does not become responsible for it.
             * The column pair is all-or-nothing, so an unknown payer stays wholly null.
             */
            payerEntityType: attempt.payer_person_id ? "person" : null,
            payerEntityId: attempt.payer_person_id,
            idempotencyKey: postingIdempotencyKey(attempt.id),
            actorUserId: null,
        });
    } catch (e) {
        // F13. The provider's success is not in doubt and is not discarded. The attempt keeps
        // `succeeded` with a null `canonical_payment_id`, which reads as "money arrived, not yet
        // recognised" — a retry, never a second charge.
        const detail = e instanceof Error ? e.message : "canonical posting failed";
        await supabase
            .from("payment_collection_attempts")
            .update({ posting_error: detail, updated_at: new Date().toISOString() })
            .eq("id", attempt.id);
        return { posted: false, reason: "posting_failed", detail };
    }

    /*
     * ── CLAIM THE RECEIPT ────────────────────────────────────────────────────────────────────────
     *
     * Guarded by `canonical_payment_id IS NULL`, so of two concurrent posters exactly one writes.
     * The loser is not an error: Thread 8's own idempotency key already made both calls return the
     * SAME payment, so the loser has simply arrived second at a fact that is already true.
     */
    const { data: claimed } = await supabase
        .from("payment_collection_attempts")
        .update({
            canonical_payment_id: result.payment.id,
            canonical_posted_at: new Date().toISOString(),
            posting_error: null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", attempt.id)
        .is("canonical_payment_id", null)
        .select("id");

    const won = ((claimed ?? []) as Array<{ id: string }>).length === 1;
    if (!won) {
        return { posted: false, reason: "already_posted", paymentId: result.payment.id };
    }

    return {
        posted: true,
        paymentId: result.payment.id,
        alreadyRecorded: result.alreadyRecorded,
        appliedCents: result.allocation?.allocated_amount_cents ?? 0,
    };
}
