/**
 * SLICE E — THE WEBHOOK BOUNDARY, where provider evidence stops being a claim.
 *
 * Everything hostile about webhook delivery is normal: at-least-once, out of order, occasionally
 * concurrent, and reachable by anyone who can find the URL. This module treats all four as the
 * contract rather than as edge cases, and it stops deliberately short of money — a converged attempt
 * is the most it may produce. Thread 8 posting is Slice F.
 *
 * ── THE ORDER OF OPERATIONS IS THE SECURITY MODEL ──
 *
 *   1. verify the signature            nothing is read as meaningful before this
 *   2. claim the event id              the database decides duplicates, not a lookup
 *   3. resolve the connected account   through the merchant binding, never from the payload
 *   4. resolve the attempt under that org
 *   5. converge the attempt state      terminal states refuse to regress, in a trigger
 *
 * Steps 3 and 4 are why `metadata` is never tenancy. Anyone can put an org id in metadata; only
 * Stripe can sign a request, and only Alloy's merchant binding says which tenant an account is.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { postProviderConfirmedCollection, type AttemptForPosting } from "./canonicalPosting";
import { mapStripeStatus } from "./collectionAttempt";
import { resolveOrgForConnectedAccount } from "./providerMerchant";
import { mapStripeRefundStatus, recognizeProviderRefund } from "./refundCollection";

export type WebhookOutcome =
    | "applied"
    | "duplicate"
    | "stale"
    | "unattributed"
    | "unsupported"
    | "rejected";

export type WebhookResult = {
    /** HTTP status the route should return. A rejection is 400; everything else is 200. */
    status: number;
    outcome: WebhookOutcome;
    detail: string;
    attemptId?: string;
    orgId?: string;
};

/** Five minutes, Stripe's own default. A replayed capture from last week is not a live delivery. */
const TOLERANCE_SECONDS = 300;

/**
 * Stripe's signature scheme, verified rather than trusted.
 *
 * The header carries a timestamp and one or more v1 HMACs; the signed payload is `${t}.${body}`,
 * which is why the RAW body must be used — re-serialising parsed JSON changes bytes and every
 * signature fails. Compared with `timingSafeEqual`, because a byte-by-byte early return leaks how
 * much of a forged signature was correct.
 */
export function verifyStripeSignature(
    rawBody: string,
    signatureHeader: string | null,
    secret: string,
    nowSeconds: number = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; reason: string } {
    if (!signatureHeader) return { ok: false, reason: "missing Stripe-Signature header" };
    if (!secret) return { ok: false, reason: "no webhook signing secret is configured" };

    const parts = new Map<string, string[]>();
    for (const piece of signatureHeader.split(",")) {
        const [k, v] = piece.split("=", 2);
        if (!k || !v) continue;
        const list = parts.get(k.trim()) ?? [];
        list.push(v.trim());
        parts.set(k.trim(), list);
    }

    const timestamp = parts.get("t")?.[0];
    const signatures = parts.get("v1") ?? [];
    if (!timestamp || signatures.length === 0) {
        return { ok: false, reason: "malformed Stripe-Signature header" };
    }

    const age = Math.abs(nowSeconds - Number(timestamp));
    if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
        return { ok: false, reason: "signature timestamp outside tolerance" };
    }

    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    for (const candidate of signatures) {
        const candidateBuf = Buffer.from(candidate, "utf8");
        if (candidateBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf)) {
            return { ok: true };
        }
    }
    return { ok: false, reason: "signature did not match" };
}

/** The PaymentIntent lifecycle this slice models. Anything else is stored and left alone. */
const SUPPORTED = new Set([
    "payment_intent.created",
    "payment_intent.requires_action",
    "payment_intent.processing",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
    // Slice G. `refund.*` carries the refund object itself, which is the only event family that
    // names a `re_…` directly; `charge.refunded` names a CHARGE and is therefore evidence that a
    // refund happened rather than evidence of which one, so it stays observed-but-unmodelled.
    "refund.created",
    "refund.updated",
]);

const TERMINAL = new Set(["succeeded", "failed", "canceled"]);

/** The event type's own implied state, for types whose object status lags or is absent. */
function stateForEvent(eventType: string, objectStatus: string | undefined): string {
    if (eventType === "payment_intent.payment_failed") return "failed";
    if (eventType === "payment_intent.canceled") return "canceled";
    return mapStripeStatus(objectStatus);
}

export async function handleStripeWebhook(
    supabase: SupabaseClient,
    rawBody: string,
    signatureHeader: string | null,
    secret: string,
): Promise<WebhookResult> {
    // ── 1. SIGNATURE FIRST. Nothing below runs for an unsigned request. ──────────────────────────
    const verified = verifyStripeSignature(rawBody, signatureHeader, secret);
    if (!verified.ok) {
        return { status: 400, outcome: "rejected", detail: verified.reason };
    }

    let event: Record<string, unknown>;
    try {
        event = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
        return { status: 400, outcome: "rejected", detail: "body is not valid JSON" };
    }

    const eventId = String(event.id ?? "");
    const eventType = String(event.type ?? "");
    if (!eventId || !eventType) {
        return { status: 400, outcome: "rejected", detail: "event is missing id or type" };
    }

    // `account` is present on Connect events and names the connected account the event belongs to.
    const connectedAccountRef = event.account ? String(event.account) : null;
    const object = ((event.data as Record<string, unknown> | undefined)?.object ?? {}) as Record<string, unknown>;
    const providerTransactionId = object.id ? String(object.id) : null;
    const providerCreated = typeof event.created === "number"
        ? new Date(event.created * 1000).toISOString()
        : null;

    /*
     * ── 2. CLAIM THE EVENT ID ────────────────────────────────────────────────────────────────────
     *
     * The insert races on purpose. Two concurrent deliveries of one event both arrive here; the
     * unique index lets exactly one proceed and the other is told it is a duplicate. A
     * "have I processed this?" SELECT would let both through, which is precisely the failure this
     * table exists to make impossible.
     */
    const { data: claimed, error: claimError } = await supabase
        .from("payment_provider_events")
        .insert({
            processor: "stripe",
            provider_event_id: eventId,
            provider_event_type: eventType,
            connected_account_ref: connectedAccountRef,
            provider_transaction_id: providerTransactionId,
            provider_created_at: providerCreated,
            payload: event,
            disposition: "received",
        })
        .select("id")
        .single();

    if (claimError) {
        if (String(claimError.message).includes("uq_payment_provider_events_processor_event")) {
            return {
                status: 200,
                outcome: "duplicate",
                detail: "this event was already recorded; nothing was done a second time",
            };
        }
        throw new Error(`could not record provider event: ${claimError.message}`);
    }
    const eventRowId = (claimed as { id: string }).id;

    const finish = async (
        outcome: WebhookOutcome,
        detail: string,
        extra: Record<string, unknown> = {},
    ): Promise<WebhookResult> => {
        await supabase
            .from("payment_provider_events")
            .update({ disposition: outcome, disposition_detail: detail, processed_at: new Date().toISOString(), ...extra })
            .eq("id", eventRowId);
        return { status: 200, outcome, detail, ...(extra.org_id ? { orgId: String(extra.org_id) } : {}) };
    };

    if (!SUPPORTED.has(eventType)) {
        // Kept, not discarded: an unmodelled type is exactly what someone will need to investigate,
        // and dropping it would leave no trace that Stripe ever said anything.
        return await finish("unsupported", `event type ${eventType} is not modelled by this slice`);
    }

    // ── 3. TENANCY FROM THE MERCHANT BINDING, NEVER FROM THE PAYLOAD ─────────────────────────────
    if (!connectedAccountRef) {
        return await finish("unattributed", "event carries no connected account; refusing to guess a tenant");
    }
    const orgId = await resolveOrgForConnectedAccount(supabase, connectedAccountRef, "stripe");
    if (!orgId) {
        // FAIL CLOSED. An account Alloy does not know is not an account Alloy may act for, however
        // convincing the metadata inside the event is.
        return await finish(
            "unattributed",
            "connected account is not bound to any organization; failing closed",
        );
    }

    /*
     * ── 4a. A REFUND EVENT (Slice G) ─────────────────────────────────────────────────────────────
     *
     * Same discipline as a collection: the refund is resolved through Alloy's own record under the
     * org the merchant binding produced, never from the payload. A `pending` refund converges the
     * provider state and stops — a balance is not restored because a refund was requested.
     */
    if (eventType.startsWith("refund.")) {
        if (!providerTransactionId) {
            return await finish("unsupported", "refund event carries no refund id", { org_id: orgId });
        }
        const { data: refundRow } = await supabase
            .from("payment_provider_refunds")
            .select("id, provider_state, provider_account_ref, canonical_refund_payment_id")
            .eq("org_id", orgId)
            .eq("processor", "stripe")
            .eq("provider_refund_id", providerTransactionId)
            .maybeSingle();
        const refundRecord = refundRow as {
            id: string; provider_state: string; provider_account_ref: string;
            canonical_refund_payment_id: string | null;
        } | null;
        if (!refundRecord) {
            return await finish("unattributed", "no refund record in this organization owns that provider refund", { org_id: orgId });
        }
        if (refundRecord.provider_account_ref !== connectedAccountRef) {
            return await finish("rejected", "refund event connected account does not match the refund's merchant", { org_id: orgId });
        }

        const refundState = mapStripeRefundStatus(object.status ? String(object.status) : undefined);
        const awaitingRecognition = refundState === "succeeded" && !refundRecord.canonical_refund_payment_id;

        if (refundRecord.provider_state !== refundState) {
            const { error: refundTransitionError } = await supabase
                .from("payment_provider_refunds")
                .update({
                    provider_state: refundState,
                    provider_state_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", refundRecord.id);
            if (refundTransitionError && !String(refundTransitionError.message).includes("is terminal at")) {
                throw new Error(`could not converge the provider refund: ${refundTransitionError.message}`);
            }
            if (refundTransitionError) {
                return await finish("stale", "another delivery reached a terminal refund state first", { org_id: orgId });
            }
        } else if (!awaitingRecognition) {
            return await finish("duplicate", `provider refund is already ${refundState}`, { org_id: orgId });
        }

        if (refundState !== "succeeded") {
            return await finish("applied", `provider refund converged to ${refundState}; no money has moved back`, { org_id: orgId });
        }

        // THE REVERSAL BOUNDARY. Thread 8 performs it; nothing here restores a balance.
        const recognized = await recognizeProviderRefund(supabase, refundRecord.id);
        const refundDetail = recognized.recognized
            ? `provider refund succeeded and canonical refund ${recognized.canonicalRefundId} was recorded`
            : `provider refund succeeded; canonical recognition did not occur: ${recognized.reason} — ${recognized.detail}`;
        return await finish("applied", refundDetail, { org_id: orgId });
    }

    // ── 4. THE ATTEMPT, UNDER THAT ORG ───────────────────────────────────────────────────────────
    if (!providerTransactionId) {
        return await finish("unsupported", "event object carries no provider transaction id", { org_id: orgId });
    }
    const { data: attemptRow } = await supabase
        .from("payment_collection_attempts")
        .select(
            "id, org_id, processor_state, provider_account_ref, charge_id, currency, "
            + "requested_amount_cents, payer_person_id, provider_transaction_id, canonical_payment_id",
        )
        .eq("org_id", orgId)
        .eq("processor", "stripe")
        .eq("provider_transaction_id", providerTransactionId)
        .maybeSingle();

    const attempt = attemptRow as (AttemptForPosting & { provider_account_ref: string }) | null;
    if (!attempt) {
        return await finish(
            "unattributed",
            "no collection attempt in this organization owns that provider transaction",
            { org_id: orgId },
        );
    }

    // The event's account and the attempt's account must agree. They cannot disagree while the
    // account→org binding is unique, but asserting it means a future non-unique binding cannot
    // quietly let one merchant's event converge another merchant's attempt.
    if (attempt.provider_account_ref !== connectedAccountRef) {
        return await finish(
            "rejected",
            "event connected account does not match the attempt's merchant",
            { org_id: orgId, collection_attempt_id: attempt.id },
        );
    }

    /*
     * ── 5. CONVERGE, WITHOUT REGRESSING ──────────────────────────────────────────────────────────
     *
     * A terminal attempt stays terminal. Re-asserting the same terminal state is what a duplicate
     * looks like and is harmless; an older `processing` arriving after `succeeded` is stale and is
     * recorded as such rather than applied. The database enforces this too — the service check here
     * exists to produce a truthful disposition, not to be the guarantee.
     */
    const nextState = stateForEvent(eventType, object.status ? String(object.status) : undefined);

    /*
     * Already at this state. Normally a duplicate and nothing to do — EXCEPT for a success that has
     * not yet been recognised as money.
     *
     * Certification caught this: an attempt can sit at `succeeded` with no canonical receipt because
     * the first posting was refused (an amount disagreement) or failed transiently. Returning
     * "duplicate" here would make that permanent — the provider's money would be stranded, with a
     * later correct delivery unable to recover it. So a succeeded-but-unposted attempt falls through
     * to the posting boundary, where the idempotency anchor makes a redundant attempt harmless.
     */
    const awaitingPosting = nextState === "succeeded" && !attempt.canonical_payment_id;
    if (attempt.processor_state === nextState && !awaitingPosting) {
        return await finish("duplicate", `attempt is already ${nextState}`, {
            org_id: orgId,
            collection_attempt_id: attempt.id,
        });
    }

    // A DIFFERENT terminal state arriving is a regression and is refused. The SAME one arriving
    // again, for a success Alloy has not yet recognised, is the recovery path above — not stale.
    if (TERMINAL.has(attempt.processor_state) && !awaitingPosting) {
        return await finish(
            "stale",
            `attempt is terminal at ${attempt.processor_state}; ${nextState} is older provider truth and was not applied`,
            { org_id: orgId, collection_attempt_id: attempt.id },
        );
    }

    const { error: transitionError } = attempt.processor_state === nextState
        ? { error: null }
        : await supabase
        .from("payment_collection_attempts")
        .update({
            processor_state: nextState,
            processor_state_at: new Date().toISOString(),
            last_provider_detail: { event_id: eventId, event_type: eventType, status: object.status ?? null },
            updated_at: new Date().toISOString(),
        })
        .eq("id", attempt.id);

    if (transitionError) {
        // The trigger refused it — another delivery reached terminal first. That is convergence, not
        // an error, and the event is recorded as stale rather than failed.
        if (String(transitionError.message).includes("is terminal at")) {
            return await finish("stale", "another delivery reached a terminal state first", {
                org_id: orgId,
                collection_attempt_id: attempt.id,
            });
        }
        throw new Error(`could not converge the collection attempt: ${transitionError.message}`);
    }

    /*
     * ── THE AUTHORITY BOUNDARY (Slice F) ─────────────────────────────────────────────────────────
     *
     * Only a provider-CONFIRMED success crosses it, and it crosses through Thread 8's canonical
     * entry rather than by writing anything financial here. Everything else this handler does stops
     * at evidence, exactly as Slice E established.
     *
     * A refusal to post is not a webhook failure: the provider really did collect, and telling
     * Stripe otherwise would earn redelivery of an event that is already correctly recorded. The
     * disposition carries what happened so it can be found and retried.
     */
    if (nextState !== "succeeded") {
        const applied = await finish("applied", `attempt converged to ${nextState}`, {
            org_id: orgId,
            collection_attempt_id: attempt.id,
        });
        return { ...applied, attemptId: attempt.id, orgId };
    }

    const posting = await postProviderConfirmedCollection(
        supabase,
        { ...attempt, processor_state: "succeeded" },
        {
            amountCents: typeof object.amount_received === "number"
                ? (object.amount_received as number)
                : typeof object.amount === "number"
                    ? (object.amount as number)
                    : null,
            currency: object.currency ? String(object.currency) : null,
        },
    );

    const detail = posting.posted
        ? `attempt converged to succeeded and posted canonical payment ${posting.paymentId}`
        : posting.reason === "already_posted"
            ? `attempt converged to succeeded; canonical payment ${posting.paymentId} already existed`
            : `attempt converged to succeeded but canonical posting did not occur: ${posting.reason} — ${posting.detail}`;

    const applied = await finish("applied", detail, {
        org_id: orgId,
        collection_attempt_id: attempt.id,
    });
    return { ...applied, attemptId: attempt.id, orgId };
}
