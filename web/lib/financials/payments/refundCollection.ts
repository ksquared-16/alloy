/**
 * SLICE G — GIVING MONEY BACK, in the same two halves everything else in this thread has.
 *
 * Stripe executes the external refund. Thread 8 owns the financial reversal. Neither does the
 * other's job, and the gap between them is a real state: a provider refund can succeed while Alloy
 * has not yet reversed anything, and the truthful reading of that is "the money went back, we have
 * not recorded it yet" — a retry, never a second refund.
 *
 * Nothing here reverses an allocation, restores a balance or writes a journal line.
 * `refundChildcarePayment` owns all of it and already emits the Thread 5 consequence itself, which
 * is why this module calls it rather than reproducing it.
 *
 * ── WHAT A REFUND IS NOT ──
 *
 * Not a deletion, not an edit, and not an unrelated negative payment. Thread 8's model is a NEW
 * outbound row pointing at the receipt through `refunds_payment_id`; the original keeps its amount,
 * its provider transaction and its posting stamp. The database enforces that independently.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { refundChildcarePayment } from "@/lib/financials/childcarePaymentService";

export type RefundRefusalReason =
    | "payment_not_found"
    | "not_a_provider_payment"
    | "manual_rail"
    | "no_provider_transaction"
    | "merchant_unavailable"
    | "invalid_amount"
    | "exceeds_refundable"
    | "currency_mismatch";

export type RequestRefundInput = {
    /** From the authenticated session. The only tenancy input. */
    orgId: string;
    /** The canonical receipt to give back. Never a client-supplied PaymentIntent. */
    paymentId: string;
    amountCents?: number;
    /**
     * Distinguishes a genuinely NEW partial refund from a RETRY of one already requested. A retry
     * reuses it; a second, deliberate partial refund supplies a different one. Without it the two
     * are indistinguishable, and the choice is between swallowing a legitimate refund and giving
     * money back twice.
     */
    intentDiscriminator?: string;
    reason?: string | null;
    actorUserId?: string | null;
};

export type RequestRefundResult =
    | {
          ok: true;
          providerRefundId: string;
          refundRecordId: string;
          amountCents: number;
          providerState: string;
          connectedAccountRef: string;
          reused: boolean;
      }
    | { ok: false; reason: RefundRefusalReason; message: string };

export function refundIntentKey(paymentId: string, amountCents: number, discriminator = "1"): string {
    return ["refund", paymentId, String(amountCents), discriminator].join(":");
}

type StripeCall = (
    path: string,
    body: Record<string, string>,
    headers: Record<string, string>,
) => Promise<{ status: number; body: Record<string, unknown> }>;

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

/** Canonically refunded so far — the sum Thread 8 already recognises, not what Stripe reports. */
async function canonicallyRefundedCents(
    supabase: SupabaseClient,
    orgId: string,
    paymentId: string,
): Promise<number> {
    const { data } = await supabase
        .from("payments")
        .select("amount_cents")
        .eq("org_id", orgId)
        .eq("refunds_payment_id", paymentId)
        .neq("status", "voided");
    return ((data ?? []) as Array<{ amount_cents: number }>)
        .reduce((sum, r) => sum + (Number(r.amount_cents) || 0), 0);
}

export async function requestProviderRefund(
    supabase: SupabaseClient,
    input: RequestRefundInput,
    stripeCall: StripeCall = defaultStripeCall,
): Promise<RequestRefundResult> {
    // ── ELIGIBILITY. Everything is re-resolved server-side from the payment id. ──────────────────
    const { data: paymentRow } = await supabase
        .from("payments")
        .select("id, org_id, amount_cents, currency, status, direction, payment_method, processor, processor_transaction_id, refunds_payment_id")
        .eq("org_id", input.orgId)
        .eq("id", input.paymentId)
        .maybeSingle();
    const payment = paymentRow as {
        id: string; org_id: string; amount_cents: number; currency: string; status: string;
        direction: string; payment_method: string; processor: string | null;
        processor_transaction_id: string | null; refunds_payment_id: string | null;
    } | null;

    if (!payment) {
        return { ok: false, reason: "payment_not_found", message: "That payment does not exist in this organization." };
    }
    if (payment.direction !== "inbound" || payment.refunds_payment_id) {
        return { ok: false, reason: "not_a_provider_payment", message: "That row is itself a refund; refund the original receipt." };
    }
    if (payment.status !== "posted") {
        return { ok: false, reason: "not_a_provider_payment", message: "Only money that actually arrived can be given back." };
    }
    /*
     * MANUAL RAILS ARE REFUSED HERE, not routed through Stripe. Cash handed back across a desk is a
     * canonical correction with no executor; sending it to a payment processor would invent a
     * provider transaction that never existed.
     */
    if (payment.processor !== "stripe") {
        return {
            ok: false,
            reason: payment.processor ? "not_a_provider_payment" : "manual_rail",
            message: payment.processor
                ? `This payment was executed by ${payment.processor}, not Stripe.`
                : `This is a ${payment.payment_method} payment with no processor; correct it through the canonical payment actions rather than through Stripe.`,
        };
    }
    if (!payment.processor_transaction_id) {
        return { ok: false, reason: "no_provider_transaction", message: "This payment carries no provider transaction to refund against." };
    }

    // The merchant the ORIGINAL collection used. Not the org's current merchant, and never the
    // platform: money goes back to where it came from.
    const { data: attemptRow } = await supabase
        .from("payment_collection_attempts")
        .select("id, provider_account_ref, currency")
        .eq("org_id", input.orgId)
        .eq("canonical_payment_id", payment.id)
        .maybeSingle();
    const attempt = attemptRow as { id: string; provider_account_ref: string; currency: string } | null;
    if (!attempt) {
        return {
            ok: false,
            reason: "merchant_unavailable",
            message: "No collection attempt owns this payment, so the connected account that collected it cannot be established.",
        };
    }

    const alreadyRefunded = await canonicallyRefundedCents(supabase, input.orgId, payment.id);
    const refundable = payment.amount_cents - alreadyRefunded;
    const amountCents = input.amountCents ?? refundable;

    if (!Number.isInteger(amountCents) || amountCents <= 0) {
        return { ok: false, reason: "invalid_amount", message: "A refund must be a positive whole number of cents." };
    }
    if (amountCents > refundable) {
        return {
            ok: false,
            reason: "exceeds_refundable",
            message: `Only ${refundable} cents of this payment remain refundable.`,
        };
    }

    const intentKey = refundIntentKey(payment.id, amountCents, input.intentDiscriminator ?? "1");

    // ── ONE INTENT, ONE REFUND. The insert races; the index decides. ─────────────────────────────
    const { data: created, error: insertError } = await supabase
        .from("payment_provider_refunds")
        .insert({
            org_id: input.orgId,
            processor: "stripe",
            original_payment_id: payment.id,
            collection_attempt_id: attempt.id,
            provider_account_ref: attempt.provider_account_ref,
            original_provider_transaction_id: payment.processor_transaction_id,
            currency: payment.currency,
            amount_cents: amountCents,
            intent_key: intentKey,
            reason: input.reason ?? null,
            created_by: input.actorUserId ?? null,
            updated_by: input.actorUserId ?? null,
        })
        .select("id, provider_refund_id, provider_state")
        .single();

    let recordId: string;
    let existingRefundId: string | null = null;
    let reused = false;

    if (insertError) {
        if (!String(insertError.message).includes("uq_payment_provider_refunds_org_intent")) {
            throw new Error(`could not open a refund intent: ${insertError.message}`);
        }
        const { data: winner } = await supabase
            .from("payment_provider_refunds")
            .select("id, provider_refund_id, provider_state")
            .eq("org_id", input.orgId)
            .eq("intent_key", intentKey)
            .single();
        const row = winner as { id: string; provider_refund_id: string | null; provider_state: string };
        recordId = row.id;
        existingRefundId = row.provider_refund_id;
        reused = true;
        // Already asked Stripe. Asking again is how money leaves twice.
        if (existingRefundId) {
            return {
                ok: true,
                providerRefundId: existingRefundId,
                refundRecordId: recordId,
                amountCents,
                providerState: row.provider_state,
                connectedAccountRef: attempt.provider_account_ref,
                reused: true,
            };
        }
    } else {
        recordId = (created as { id: string }).id;
    }

    // ── THE REFUND, ON THE ACCOUNT THAT COLLECTED ────────────────────────────────────────────────
    const response = await stripeCall(
        "refunds",
        {
            payment_intent: payment.processor_transaction_id,
            amount: String(amountCents),
            "metadata[alloy_refund_record]": recordId,
            "metadata[alloy_payment_id]": payment.id,
        },
        {
            "Stripe-Account": attempt.provider_account_ref,
            // Alloy's intent, so a transport retry returns the same refund rather than a second one.
            "Idempotency-Key": `${input.orgId}:${intentKey}`,
        },
    );

    if (response.status !== 200) {
        const err = (response.body.error ?? {}) as { message?: string };
        throw new Error(`Stripe refused the refund: ${err.message ?? response.status}`);
    }

    const refund = response.body as { id?: string; status?: string };
    const providerRefundId = String(refund.id ?? "");
    const providerState = mapStripeRefundStatus(refund.status);

    await supabase
        .from("payment_provider_refunds")
        .update({
            provider_refund_id: providerRefundId,
            provider_state: providerState,
            provider_state_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", recordId);

    return {
        ok: true,
        providerRefundId,
        refundRecordId: recordId,
        amountCents,
        providerState,
        connectedAccountRef: attempt.provider_account_ref,
        reused,
    };
}

/** Stripe's refund statuses, unchanged. `requires_action` is not money back. */
export function mapStripeRefundStatus(status: string | undefined): string {
    switch (status) {
        case "succeeded":
            return "succeeded";
        case "failed":
            return "failed";
        case "canceled":
            return "canceled";
        default:
            return "pending";
    }
}

export type RecognizeOutcome =
    | { recognized: true; canonicalRefundId: string }
    | { recognized: false; reason: "not_succeeded" | "already_recognized" | "failed"; detail: string };

/**
 * Turn a provider-confirmed refund into the canonical Thread 8 reversal, at most once.
 *
 * The balance is not restored because a refund was requested — only a `succeeded` provider refund
 * reaches here, and even then the reversal is Thread 8's to perform.
 */
export async function recognizeProviderRefund(
    supabase: SupabaseClient,
    refundRecordId: string,
): Promise<RecognizeOutcome> {
    const { data: row } = await supabase
        .from("payment_provider_refunds")
        .select("id, org_id, original_payment_id, amount_cents, provider_state, canonical_refund_payment_id, reason")
        .eq("id", refundRecordId)
        .maybeSingle();
    const record = row as {
        id: string; org_id: string; original_payment_id: string; amount_cents: number;
        provider_state: string; canonical_refund_payment_id: string | null; reason: string | null;
    } | null;
    if (!record) return { recognized: false, reason: "failed", detail: "refund record not found" };

    if (record.provider_state !== "succeeded") {
        return { recognized: false, reason: "not_succeeded", detail: `provider refund is ${record.provider_state}` };
    }
    if (record.canonical_refund_payment_id) {
        return { recognized: false, reason: "already_recognized", detail: record.canonical_refund_payment_id };
    }

    let result;
    try {
        result = await refundChildcarePayment(supabase, {
            orgId: record.org_id,
            paymentId: record.original_payment_id,
            amountCents: record.amount_cents,
            reason: record.reason ?? "Stripe refund",
            // Anchored on the refund INTENT, so a replayed event and a retried recognition converge.
            idempotencyKey: `stripe-refund:${record.id}`,
            actorUserId: null,
        });
    } catch (e) {
        const detail = e instanceof Error ? e.message : "canonical refund failed";
        await supabase
            .from("payment_provider_refunds")
            .update({ recognition_error: detail, updated_at: new Date().toISOString() })
            .eq("id", record.id);
        return { recognized: false, reason: "failed", detail };
    }

    // Claim it. Of two concurrent recognisers exactly one writes; the loser has arrived second at a
    // fact already true, because Thread 8's own key returned the same refund row to both.
    const { data: claimed } = await supabase
        .from("payment_provider_refunds")
        .update({
            canonical_refund_payment_id: result.refund.id,
            canonical_recognized_at: new Date().toISOString(),
            recognition_error: null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", record.id)
        .is("canonical_refund_payment_id", null)
        .select("id");

    if (((claimed ?? []) as Array<{ id: string }>).length !== 1) {
        return { recognized: false, reason: "already_recognized", detail: result.refund.id };
    }
    return { recognized: true, canonicalRefundId: result.refund.id };
}
