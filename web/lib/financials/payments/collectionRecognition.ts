import type { SupabaseClient } from "@supabase/supabase-js";

import { postProviderConfirmedCollection, type AttemptForPosting } from "./canonicalPosting";

/**
 * RECOGNISING MONEY THE PROVIDER ALREADY TOOK — the repair half of the collection spine.
 *
 * The spine is: intent → attempt → provider execution → canonical Payment → allocation. Every step
 * has always worked, and one gap has always been possible between the third and the fourth: the
 * provider says `succeeded`, and `canonical_payment_id` is still null. That is money the family has
 * paid and Alloy has not recorded.
 *
 * It happens for ordinary reasons — a webhook that never arrived, a posting that refused because an
 * accounting period was closed, a charge that moved. The database has indexed that state since
 * Thread 8's slice F (`processor_state = 'succeeded' AND canonical_payment_id IS NULL`). Nothing
 * ever SHOWED it to an operator or let them act on it.
 *
 * ── THIS MODULE CREATES NO MONEY ──
 *
 * It does not write `payments`, does not write an allocation, and has no opinion about amounts. It
 * re-invokes `postProviderConfirmedCollection`, which is the same and only authority the webhook
 * uses. A second way to turn provider success into a receipt would be a second answer to the only
 * question in Payments that must have one.
 *
 * ── AND IT VERIFIES SETTLEMENT AT THE PROVIDER, NOT FROM OUR OWN CACHE ──
 *
 * `processor_state` is Alloy's cached copy of what Stripe last said. Recognising from it alone would
 * let a stale — or tampered — local row mint a receipt. So the provider is re-read and must itself
 * say the money arrived. That is the whole difference between repairing a gap and inventing cash.
 */

export type RecognizeRefusal =
    | "attempt_not_found"
    | "not_settled"
    | "provider_unreachable"
    | "posting_refused";

export type RecognizeResult =
    | {
          ok: true;
          /** True when THIS call recognised it; false when it was already recognised. */
          recognized: boolean;
          paymentId: string;
          attemptId: string;
      }
    | {
          ok: false;
          reason: RecognizeRefusal;
          message: string;
          attemptId: string | null;
          /** The posting authority's own reason, when it was reached and refused. */
          postingReason?: string;
      };

export type ProviderIntentRead = (
    providerTransactionId: string,
    connectedAccountRef: string,
) => Promise<{ status: number; body: Record<string, unknown> }>;

const defaultIntentRead: ProviderIntentRead = async (providerTransactionId, connectedAccountRef) => {
    const secret = process.env.STRIPE_SECRET_KEY ?? "";
    if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured for this runtime");
    const res = await fetch(
        `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(providerTransactionId)}`,
        { headers: { Authorization: `Bearer ${secret}`, "Stripe-Account": connectedAccountRef } },
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const ATTEMPT_COLUMNS =
    "id, org_id, charge_id, currency, requested_amount_cents, payer_person_id, "
    + "provider_transaction_id, processor_state, canonical_payment_id, rail, "
    + "provider_account_ref, merchant_id, payment_method_id, expected_settlement_on";

/**
 * Repair one unrecognised collection, at most once.
 *
 * Safe to call twice, concurrently, or after somebody else has already fixed it: an attempt that is
 * already recognised returns its existing receipt with `recognized: false`, and the posting
 * authority's own unique key is what makes that correct rather than merely likely when two actors
 * arrive together.
 */
export async function recognizeCollectionAttempt(
    supabase: SupabaseClient,
    args: { orgId: string; attemptId: string; actorUserId?: string | null },
    readIntent: ProviderIntentRead = defaultIntentRead,
): Promise<RecognizeResult> {
    const orgId = String(args.orgId ?? "").trim();
    const attemptId = String(args.attemptId ?? "").trim();
    if (!orgId || !attemptId) {
        return { ok: false, reason: "attempt_not_found", message: "No collection was named.", attemptId: null };
    }

    const { data, error } = await supabase
        .from("payment_collection_attempts")
        .select(ATTEMPT_COLUMNS)
        .eq("org_id", orgId)
        .eq("id", attemptId)
        .maybeSingle();

    if (error || !data) {
        /* An attempt in another organisation reads as absent, not as forbidden. */
        return {
            ok: false,
            reason: "attempt_not_found",
            message: "That collection is not in this organization.",
            attemptId: null,
        };
    }

    const attempt = data as unknown as AttemptForPosting & {
        provider_account_ref: string;
        payment_method_id: string | null;
    };

    /*
     * ALREADY DONE IS A SUCCESS, NOT A REFUSAL.
     *
     * Two operators can be looking at the same queue row. The second one must be told the money is
     * recognised and shown the receipt — not handed an error that invites them to try harder.
     */
    if (attempt.canonical_payment_id) {
        return { ok: true, recognized: false, paymentId: attempt.canonical_payment_id, attemptId: attempt.id };
    }

    if (!attempt.provider_transaction_id) {
        return {
            ok: false,
            reason: "not_settled",
            message: "This collection never reached the provider, so there is no money to recognize.",
            attemptId: attempt.id,
        };
    }

    // ── THE PROVIDER'S OWN ANSWER, not our cached copy of it. ────────────────────────────────────
    let body: Record<string, unknown>;
    try {
        const res = await readIntent(attempt.provider_transaction_id, attempt.provider_account_ref);
        if (res.status !== 200) {
            const err = (res.body?.error ?? {}) as { message?: string };
            return {
                ok: false,
                reason: "provider_unreachable",
                message: `The provider could not confirm this collection: ${err.message ?? `status ${res.status}`}`,
                attemptId: attempt.id,
            };
        }
        body = res.body;
    } catch (e) {
        return {
            ok: false,
            reason: "provider_unreachable",
            message: e instanceof Error ? e.message : "The provider could not be reached.",
            attemptId: attempt.id,
        };
    }

    const providerStatus = String((body as { status?: string }).status ?? "");
    if (providerStatus !== "succeeded") {
        return {
            ok: false,
            reason: "not_settled",
            message:
                providerStatus === "processing"
                    ? "This bank payment is still processing. It becomes money when it settles, not before."
                    : `The provider does not report this collection as settled (${providerStatus || "unknown"}).`,
            attemptId: attempt.id,
        };
    }

    /*
     * The amounts come from the PROVIDER and are handed to the posting authority to compare against
     * what Alloy authorised. This module never reconciles them itself — a disagreement is a finding
     * that belongs to the one place allowed to refuse.
     */
    const amountReceived = (body as { amount_received?: unknown }).amount_received;
    const amount = (body as { amount?: unknown }).amount;
    const posting = await postProviderConfirmedCollection(
        supabase,
        { ...attempt, processor_state: "succeeded" },
        {
            amountCents:
                typeof amountReceived === "number" ? amountReceived : typeof amount === "number" ? amount : null,
            currency: (body as { currency?: unknown }).currency ? String((body as { currency: unknown }).currency) : null,
        },
    );

    if (posting.posted) {
        return { ok: true, recognized: true, paymentId: posting.paymentId, attemptId: attempt.id };
    }
    /* Somebody else won the race between our read and our write. Their receipt is the answer. */
    if (posting.reason === "already_posted") {
        return { ok: true, recognized: false, paymentId: posting.paymentId, attemptId: attempt.id };
    }

    return {
        ok: false,
        reason: "posting_refused",
        message: operatorReason(posting.reason, posting.detail),
        attemptId: attempt.id,
        postingReason: posting.reason,
    };
}

/**
 * The posting authority's reason, said to an operator.
 *
 * Deliberately not the raw reason code: `amount_mismatch` tells an engineer what happened and tells
 * a front-desk administrator nothing about what to do. The refusal is never hidden — the row stays
 * in the queue carrying this sentence.
 */
export function operatorReason(reason: string, detail?: string): string {
    switch (reason) {
        case "amount_mismatch":
            return `The provider collected a different amount than this collection authorized${detail ? ` — ${detail}` : ""}. It needs a person to decide which is right.`;
        case "currency_mismatch":
            return "The provider collected in a different currency than this collection authorized.";
        case "not_succeeded":
            return "The provider does not report this collection as settled.";
        case "posting_failed":
            return detail
                ? `Alloy could not record the payment: ${detail}`
                : "Alloy could not record the payment against its obligation.";
        default:
            return detail ? `Recognition did not complete: ${detail}` : "Recognition did not complete.";
    }
}

export type UnrecognizedCollection = {
    attemptId: string;
    orgId: string;
    customerId: string | null;
    chargeId: string | null;
    amountCents: number;
    currency: string;
    rail: "card" | "ach";
    payerPersonId: string | null;
    providerState: string;
    providerStateAt: string | null;
    expectedSettlementOn: string | null;
    paymentMethodId: string | null;
    methodBrand: string | null;
    methodLast4: string | null;
    lastReason: string | null;
};

/**
 * THE RECOGNITION QUEUE — provider-confirmed collections Alloy has not turned into money yet.
 *
 * Cross-account and org-scoped, because the question "what money have we not recorded" is asked of
 * the organisation, not of one family. It reads the state the database has indexed since slice F.
 *
 * Bounded by `limit` rather than paged: this is a work queue, and a queue with a thousand rows in it
 * is a different problem from the one this surface solves.
 */
export async function readUnrecognizedCollections(
    supabase: SupabaseClient,
    args: { orgId: string; limit?: number },
): Promise<UnrecognizedCollection[]> {
    const orgId = String(args.orgId ?? "").trim();
    if (!orgId) return [];

    const { data, error } = await supabase
        .from("payment_collection_attempts")
        .select(
            "id, org_id, billable_source_type, billable_source_id, charge_id, requested_amount_cents, "
            + "currency, rail, payer_person_id, processor_state, processor_state_at, "
            + "expected_settlement_on, payment_method_id, last_provider_detail",
        )
        .eq("org_id", orgId)
        .eq("processor_state", "succeeded")
        .is("canonical_payment_id", null)
        .order("processor_state_at", { ascending: true })
        .limit(Math.min(Math.max(args.limit ?? 100, 1), 200));

    if (error || !data) return [];
    const rows = data as unknown as Array<Record<string, unknown>>;
    if (!rows.length) return [];

    /*
     * Safe method display, joined in one read rather than per row. The surface shows what the
     * operator recognises — "Visa •••• 4242" — and never a provider reference.
     */
    const methodIds = [...new Set(rows.map((r) => String(r.payment_method_id ?? "")).filter(Boolean))];
    const methods = new Map<string, { brand: string | null; last4: string | null }>();
    if (methodIds.length) {
        const { data: methodRows } = await supabase
            .from("payment_methods")
            .select("id, display_brand, display_last4")
            .eq("org_id", orgId)
            .in("id", methodIds);
        for (const m of (methodRows ?? []) as Array<Record<string, unknown>>) {
            methods.set(String(m.id), {
                brand: m.display_brand ? String(m.display_brand) : null,
                last4: m.display_last4 ? String(m.display_last4) : null,
            });
        }
    }

    return rows.map((r) => {
        const methodId = String(r.payment_method_id ?? "") || null;
        const display = methodId ? methods.get(methodId) : undefined;
        const detail = (r.last_provider_detail ?? {}) as { recognition_reason?: unknown };
        return {
            attemptId: String(r.id),
            orgId: String(r.org_id),
            /* The ACCOUNT, when the obligation is billed to one directly. */
            customerId: r.billable_source_type === "customer" ? String(r.billable_source_id) : null,
            chargeId: r.charge_id ? String(r.charge_id) : null,
            amountCents: Number(r.requested_amount_cents) || 0,
            currency: String(r.currency ?? "USD"),
            rail: (String(r.rail ?? "card") === "ach" ? "ach" : "card") as "card" | "ach",
            payerPersonId: r.payer_person_id ? String(r.payer_person_id) : null,
            providerState: String(r.processor_state ?? ""),
            providerStateAt: r.processor_state_at ? String(r.processor_state_at) : null,
            expectedSettlementOn: r.expected_settlement_on ? String(r.expected_settlement_on) : null,
            paymentMethodId: methodId,
            methodBrand: display?.brand ?? null,
            methodLast4: display?.last4 ?? null,
            lastReason: detail.recognition_reason ? String(detail.recognition_reason) : null,
        };
    });
}

/**
 * Keep a refusal where an operator will see it again.
 *
 * Written into the attempt's bounded provider detail rather than into a new column or a new table:
 * the refusal is evidence about this attempt, and W3 is allowed exactly two columns. It NEVER
 * touches provider state — mutating the evidence to make recognition succeed is the one thing this
 * whole module exists to avoid.
 */
export async function recordRecognitionRefusal(
    supabase: SupabaseClient,
    args: { orgId: string; attemptId: string; reason: string; actorUserId?: string | null },
): Promise<void> {
    const { data } = await supabase
        .from("payment_collection_attempts")
        .select("last_provider_detail")
        .eq("org_id", args.orgId)
        .eq("id", args.attemptId)
        .maybeSingle();
    const prior = ((data as { last_provider_detail?: Record<string, unknown> } | null)?.last_provider_detail
        ?? {}) as Record<string, unknown>;

    await supabase
        .from("payment_collection_attempts")
        .update({
            last_provider_detail: {
                ...prior,
                recognition_reason: args.reason,
                recognition_attempted_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
            updated_by: args.actorUserId ?? null,
        })
        .eq("org_id", args.orgId)
        .eq("id", args.attemptId);
}
