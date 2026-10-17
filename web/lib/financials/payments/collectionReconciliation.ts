/**
 * RECONCILING COLLECTIONS WHOSE WEBHOOK NEVER ARRIVED — the server-driven half of recognition.
 *
 * A provider can collect and Alloy can never hear about it: the webhook delivery failed past
 * Stripe's retry window, the endpoint was misconfigured for an hour, and the payer closed the tab
 * before the browser asked. Recognition already knew how to repair that — `recognizeCollectionAttempt`
 * re-reads the PaymentIntent and posts through the one posting authority — but only when somebody
 * asked: an operator working the queue, or a browser still open. And the operator queue lists only
 * attempts Alloy already believes `succeeded`, which is exactly what a lost webhook never told it.
 * So a provider-successful attempt could stay unapplied indefinitely.
 *
 * This sweep asks on nobody's behalf, from the platform's existing clock (the scheduled-work wake).
 *
 * ── WHAT IT MAY DO, AND WHAT IT MAY NOT ──
 *
 *   • It reads the PROVIDER, never trusts the cached state — the same call recognition makes.
 *   • It posts only through `recognizeCollectionAttempt` → `postProviderConfirmedCollection`, so the
 *     posting anchor (`stripe-collection:<attempt>`) makes a concurrent webhook, a duplicate event or
 *     a second sweep harmless.
 *   • Each attempt is acted on under ITS OWN org, merchant account, charge and payer. Nothing here
 *     chooses any of them; there is no input that could.
 *   • It touches only attempts that reached the provider, have no receipt, and have been quiet long
 *     enough that a webhook would normally have landed. It never creates, cancels or re-prices one.
 *   • It is bounded per wake and stamps each attempt it read, so an abandoned card form is looked at
 *     on a slow cadence for a bounded window rather than every five minutes forever.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ScheduledWorkContext, ScheduledWorkOutcome } from "@/lib/scheduledWork/scheduledWorkTypes";

import { recognizeCollectionAttempt, type ProviderIntentRead } from "./collectionRecognition";

/** States in which the provider may have collected while Alloy was not told. */
const RECONCILABLE_STATES = ["initiated", "requires_payment_method", "requires_action", "processing", "succeeded", "failed"];

export type ReconciliationOptions = {
    now?: Date;
    /** A webhook normally lands within seconds; give it this long before asking ourselves. */
    quietForMs?: number;
    /** Attempts older than this are left to the operator queue and Stripe's own records. */
    lookbackMs?: number;
    /** Do not re-read an attempt this sweep already read within this interval. */
    recheckAfterMs?: number;
    /** Provider reads per wake. */
    limit?: number;
    readIntent?: ProviderIntentRead;
    /**
     * Narrow the sweep to these attempts. For certification on a SHARED database, where other
     * sessions' attempts must not be read or touched; the clock never passes it.
     */
    onlyAttemptIds?: readonly string[];
};

export type ReconciliationSummary = {
    examined: number;
    recognized: number;
    alreadyRecognized: number;
    notSettled: number;
    refused: number;
    unreachable: number;
};

const DEFAULTS = {
    quietForMs: 10 * 60 * 1000,
    lookbackMs: 7 * 24 * 60 * 60 * 1000,
    recheckAfterMs: 30 * 60 * 1000,
    limit: 20,
};

export async function reconcileUnrecognizedCollections(
    supabase: SupabaseClient,
    options: ReconciliationOptions = {},
): Promise<ReconciliationSummary> {
    const now = options.now ?? new Date();
    const quietForMs = options.quietForMs ?? DEFAULTS.quietForMs;
    const lookbackMs = options.lookbackMs ?? DEFAULTS.lookbackMs;
    const recheckAfterMs = options.recheckAfterMs ?? DEFAULTS.recheckAfterMs;
    const limit = Math.min(Math.max(options.limit ?? DEFAULTS.limit, 1), 100);

    const summary: ReconciliationSummary = {
        examined: 0, recognized: 0, alreadyRecognized: 0, notSettled: 0, refused: 0, unreachable: 0,
    };

    const quietBefore = new Date(now.getTime() - quietForMs).toISOString();
    const notBefore = new Date(now.getTime() - lookbackMs).toISOString();

    if (options.onlyAttemptIds && !options.onlyAttemptIds.length) return summary;

    // Oldest first, over-fetched so recently-read ones can be skipped without starving the rest.
    let query = supabase
        .from("payment_collection_attempts")
        .select("id, org_id, last_provider_detail")
        .is("canonical_payment_id", null)
        .not("provider_transaction_id", "is", null)
        .in("processor_state", RECONCILABLE_STATES)
        .lt("updated_at", quietBefore)
        .gt("created_at", notBefore);
    if (options.onlyAttemptIds) query = query.in("id", [...options.onlyAttemptIds]);
    const { data, error } = await query.order("updated_at", { ascending: true }).limit(limit * 5);
    // A failed read is infrastructure, not "nothing to do": the scheduler retries it.
    if (error) throw new Error(`could not read unrecognized collections: ${error.message}`);
    if (!data) return summary;

    const candidates = (data as Array<{ id: string; org_id: string; last_provider_detail: Record<string, unknown> | null }>)
        .filter((row) => {
            const last = Date.parse(String(row.last_provider_detail?.reconciled_at ?? ""));
            return !Number.isFinite(last) || now.getTime() - last >= recheckAfterMs;
        })
        .slice(0, limit);

    for (const row of candidates) {
        summary.examined += 1;
        const result = await recognizeCollectionAttempt(
            supabase,
            { orgId: row.org_id, attemptId: row.id },
            options.readIntent,
        );

        if (result.ok) {
            if (result.recognized) summary.recognized += 1;
            else summary.alreadyRecognized += 1;
            continue;
        }

        if (result.reason === "not_settled") summary.notSettled += 1;
        else if (result.reason === "provider_unreachable") summary.unreachable += 1;
        else if (result.reason === "posting_refused") summary.refused += 1;

        /*
         * Stamp the read so the next wake moves on to other attempts — evidence only, never state.
         * `updated_at` moves too, which sends the attempt to the back of the oldest-first queue. A
         * posting refusal is written as `recognition_reason`, the field the operator queue reads, so
         * money the sweep could not record is shown to a person exactly as an operator's own refusal
         * would be.
         */
        await supabase
            .from("payment_collection_attempts")
            .update({
                last_provider_detail: {
                    ...(row.last_provider_detail ?? {}),
                    reconciled_at: now.toISOString(),
                    reconciled_reason: result.reason,
                    ...(result.reason === "posting_refused"
                        ? { recognition_reason: result.message, recognition_attempted_at: now.toISOString() }
                        : {}),
                },
                updated_at: now.toISOString(),
            })
            .eq("org_id", row.org_id)
            .eq("id", row.id)
            .is("canonical_payment_id", null);
    }

    return summary;
}

/**
 * THE SCHEDULED-WORK HANDLER (`payments.collection.reconcile`).
 *
 * One system-wide schedule, not one per organization: the sweep acts on each attempt under that
 * attempt's own org, and an org that connects a merchant tomorrow is covered without anyone
 * remembering to register it. Finding nothing to reconcile is a COMPLETED occurrence — the most
 * common healthy outcome — and only a failure to read the attempts at all is retried.
 */
export async function evaluateCollectionReconciliationOccurrence(
    _ctx: ScheduledWorkContext,
    deps: { supabase: SupabaseClient; options?: ReconciliationOptions },
): Promise<ScheduledWorkOutcome> {
    try {
        const summary = await reconcileUnrecognizedCollections(deps.supabase, deps.options);
        return { kind: "completed", diagnostic: { ...summary } };
    } catch (e) {
        return {
            kind: "retryable_failure",
            reason: e instanceof Error ? e.message : "collection reconciliation failed",
        };
    }
}
