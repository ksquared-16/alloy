/**
 * THREAD 8C SLICE 3 — money the provider took back, recognised exactly once.
 *
 * Thread 8B's refund path starts with an operator deciding. This one starts with nobody deciding:
 * the bank returns an ACH debit, Stripe raises a DISPUTE, and Alloy finds out. The financial
 * consequence is the same reversal Thread 8 already owns — the receipt stands, its applications
 * reverse, outstanding comes back — so this module calls `refundChildcarePayment` rather than
 * reproducing any of it, and passes `reversalOrigin: "provider"` so the two can never be confused.
 *
 * ── THE ECONOMIC IDENTITY IS THE DISPUTE, NOT THE EVENT ──
 *
 * Measured on the governed test merchant, one return produced three events —
 * `charge.dispute.created`, `charge.dispute.funds_withdrawn`, `charge.dispute.closed`. Anchoring on
 * the event id would reverse a family's balance three times. The dispute id is the key, the unique
 * index enforces it, and the events stay durable evidence in `payment_provider_events`.
 *
 * ── AND OPENING A DISPUTE IS NOT MONEY MOVING ──
 *
 * `created` is a notification. `funds_withdrawn` is the provider saying the cash is gone. Restoring
 * a family's outstanding on `created` would tell them they owe money again while the payment is
 * still sitting there, so recognition waits for the withdrawal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { refundChildcarePayment } from "@/lib/financials/childcarePaymentService";

/** The Thread 8 idempotency key for one economic reversal. Never a delivery id. */
export function disputeReversalIdempotencyKey(providerDisputeId: string): string {
    return `stripe-dispute:${providerDisputeId}`;
}

export type DisputeEvidence = {
    orgId: string;
    processor: "stripe";
    providerDisputeId: string;
    providerAccountRef: string;
    /** The disputed transaction (`pi_…`), which is how the original receipt is found. */
    providerTransactionId: string | null;
    /**
     * THE DISPUTE'S OWN AMOUNT, in cents.
     *
     * Never the balance-transaction net. A 1500 return with a 1500 dispute fee nets -3000, and a
     * family whose outstanding was restored from that would be billed twice for one return. The fee
     * is what it costs the merchant to be disputed; it is not family debt.
     */
    amountCents: number;
    currency: string;
    providerReason: string | null;
    providerState: string | null;
    /** True only for the event that says the money actually left. */
    fundsWithdrawn: boolean;
    providerStateAt: string | null;
};

export type DisputeOutcome =
    | { recognized: true; reversalPaymentId: string; alreadyRecognized: boolean; amountCents: number }
    | { recognized: false; reason: "awaiting_funds_withdrawn"; disputeId: string }
    | { recognized: false; reason: "original_not_recognized"; disputeId: string }
    | { recognized: false; reason: "no_original_payment"; disputeId: string }
    | { recognized: false; reason: "recognition_failed"; disputeId: string; detail: string };

type DisputeRow = {
    id: string;
    org_id: string;
    original_payment_id: string | null;
    amount_cents: number;
    provider_dispute_id: string;
    canonical_reversal_payment_id: string | null;
    funds_withdrawn_at: string | null;
};

/**
 * Record what the provider said, and reverse only when it says the money is gone.
 *
 * Every event for one dispute lands on the same row. Whether that row has produced a canonical
 * reversal is a separate fact, so a `closed` arriving after recognition updates evidence and
 * changes no money.
 */
export async function recognizeProviderDispute(
    supabase: SupabaseClient,
    evidence: DisputeEvidence,
): Promise<DisputeOutcome> {
    /*
     * ── FIND THE RECEIPT THE DISPUTE IS ABOUT ──
     *
     * Through Alloy's own attempt, never through anything the event asserts: the disputed
     * transaction names the collection, and the collection names the canonical payment it produced.
     * An attempt that has not yet been recognised gives `null`, which is the out-of-order case
     * below rather than an error.
     */
    let originalPaymentId: string | null = null;
    let attemptId: string | null = null;
    if (evidence.providerTransactionId) {
        const { data: attempt } = await supabase
            .from("payment_collection_attempts")
            .select("id, canonical_payment_id")
            .eq("org_id", evidence.orgId)
            .eq("provider_transaction_id", evidence.providerTransactionId)
            .maybeSingle();
        const row = attempt as { id: string; canonical_payment_id: string | null } | null;
        attemptId = row?.id ?? null;
        originalPaymentId = row?.canonical_payment_id ?? null;
    }

    // ── EVIDENCE FIRST, always. It is durable whether or not it can be acted on yet. ────────────
    const { data: upserted, error: upsertError } = await supabase
        .from("payment_provider_disputes")
        .upsert(
            {
                org_id: evidence.orgId,
                processor: evidence.processor,
                provider_dispute_id: evidence.providerDisputeId,
                provider_account_ref: evidence.providerAccountRef,
                /*
                 * EVIDENCE ACCUMULATES, IT NEVER REGRESSES.
                 *
                 * A later event for the same dispute can arrive before the receipt is resolvable, and
                 * writing the unresolved `null` back over an original that an earlier event had
                 * already found would un-know it — which showed up immediately as a dispute that
                 * could never be recognised however many times it was replayed.
                 */
                ...(evidence.providerTransactionId
                    ? { original_provider_transaction_id: evidence.providerTransactionId }
                    : {}),
                ...(originalPaymentId ? { original_payment_id: originalPaymentId } : {}),
                ...(attemptId ? { collection_attempt_id: attemptId } : {}),
                amount_cents: evidence.amountCents,
                currency: (evidence.currency || "USD").toUpperCase(),
                provider_reason: evidence.providerReason,
                provider_state: evidence.providerState,
                provider_state_at: evidence.providerStateAt ?? new Date().toISOString(),
                ...(evidence.fundsWithdrawn
                    ? { funds_withdrawn_at: evidence.providerStateAt ?? new Date().toISOString() }
                    : {}),
                updated_at: new Date().toISOString(),
            },
            { onConflict: "processor,provider_dispute_id" },
        )
        .select("id, org_id, original_payment_id, amount_cents, provider_dispute_id, canonical_reversal_payment_id, funds_withdrawn_at")
        .single();

    if (upsertError || !upserted) {
        return {
            recognized: false,
            reason: "recognition_failed",
            disputeId: evidence.providerDisputeId,
            detail: upsertError?.message ?? "dispute evidence could not be recorded",
        };
    }
    const dispute = upserted as DisputeRow;

    // Already reversed. A later `closed` is evidence, not a second withdrawal.
    if (dispute.canonical_reversal_payment_id) {
        return {
            recognized: true,
            reversalPaymentId: dispute.canonical_reversal_payment_id,
            alreadyRecognized: true,
            amountCents: dispute.amount_cents,
        };
    }

    // A dispute that has been raised but not funded is not money leaving.
    const withdrawn = evidence.fundsWithdrawn || Boolean(dispute.funds_withdrawn_at);
    if (!withdrawn) {
        return { recognized: false, reason: "awaiting_funds_withdrawn", disputeId: evidence.providerDisputeId };
    }

    /*
     * OUT OF ORDER. The provider can tell us the money went back before we finished recognising it
     * arriving. Reversing a receipt that does not exist would be a lie; the evidence is already
     * durable, so this converges when recognition catches up.
     */
    const resolvedOriginal = dispute.original_payment_id ?? originalPaymentId;
    if (!resolvedOriginal) {
        return {
            recognized: false,
            reason: evidence.providerTransactionId ? "original_not_recognized" : "no_original_payment",
            disputeId: evidence.providerDisputeId,
        };
    }

    // ── THE ONE PLACE THIS BECOMES MONEY, and Thread 8 owns all of it. ──────────────────────────
    try {
        const result = await refundChildcarePayment(supabase, {
            orgId: dispute.org_id,
            paymentId: resolvedOriginal,
            amountCents: dispute.amount_cents,
            reason: evidence.providerReason ?? "provider dispute",
            idempotencyKey: disputeReversalIdempotencyKey(evidence.providerDisputeId),
            reversalOrigin: "provider",
            metadata: {
                provider_dispute_id: evidence.providerDisputeId,
                provider_reason: evidence.providerReason,
            },
        });

        const reversalId = (result.refund as { id: string }).id;
        await supabase
            .from("payment_provider_disputes")
            .update({
                canonical_reversal_payment_id: reversalId,
                canonical_recognized_at: new Date().toISOString(),
                recognition_error: null,
                updated_at: new Date().toISOString(),
            })
            .eq("id", dispute.id)
            .is("canonical_reversal_payment_id", null);

        return {
            recognized: true,
            reversalPaymentId: reversalId,
            alreadyRecognized: Boolean(result.alreadyRefunded),
            amountCents: dispute.amount_cents,
        };
    } catch (e) {
        const detail = e instanceof Error ? e.message : "reversal failed";
        // Recorded, not swallowed: an unrecognised withdrawal is a retry state, not a loss.
        await supabase
            .from("payment_provider_disputes")
            .update({ recognition_error: detail, updated_at: new Date().toISOString() })
            .eq("id", dispute.id);
        return { recognized: false, reason: "recognition_failed", disputeId: evidence.providerDisputeId, detail };
    }
}
