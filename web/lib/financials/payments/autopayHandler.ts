/**
 * THE REGISTERED PAYMENTS AUTOPAY HANDLER — where the clock meets the money, and stops.
 *
 * The generic Scheduled Work runtime owns time, the occurrence, the claim/lease, dispatch and
 * infrastructure retry. It hands this function a context and asks for an outcome. Everything a
 * PAYMENT means begins here and never leaks back the other way.
 *
 * ── THE MOST IMPORTANT RULE IN THIS FILE ──
 *
 * A DOMAIN REFUSAL IS A SUCCESSFUL RUN. Nothing due, an amount over the authorized ceiling, a
 * paused arrangement, a dead card — each is this handler doing its job correctly and returning
 * `completed`. Reporting them as failures would hand the generic runtime a money decision to retry,
 * and would fill the operator's failure surface with healthy days until nobody reads it.
 *
 * `retryable_failure` is reserved for the runtime being unable to complete the attempt at all.
 * PAYMENT retry — the bank declined, try again in three business days — is Payments' own policy
 * and is expressed as a future occurrence, not as an infrastructure retry.
 *
 * ── FINAL ADMISSION ──
 *
 * A scheduled occurrence is not permission to charge. Between the moment this occurrence was
 * materialised and the moment the provider is called, an operator may have recorded a cheque, a
 * card may have expired, a merchant may have been restricted and the payer may have revoked. So
 * every authority is re-resolved here, immediately before collection, and the collectible is read
 * last of all.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    failAutopay,
    readArrangementById,
    recordAutopayAttempt,
    type AutopayArrangement,
} from "@/lib/financials/payments/autopayArrangement";
import { resolveAutopayCollectible } from "@/lib/financials/payments/autopayCollectible";
import { createCardCollection } from "@/lib/financials/payments/collectionAttempt";
import type { ScheduledWorkContext, ScheduledWorkOutcome } from "@/lib/scheduledWork/scheduledWorkTypes";

/** V1 retry economics. In code, not configuration: a tenant cannot widen the ceiling by editing a row. */
export const AUTOPAY_MAX_RETRIES = 2;
export const AUTOPAY_RETRY_WINDOW_DAYS = 40;
export const ACH_RETRY_MIN_BUSINESS_DAYS = 3;

const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Operator-facing reasons. Each is a truthful completion, never an infrastructure failure. */
export type AutopayNoCollectionReason =
    | "arrangement_missing"
    | "arrangement_revoked"
    | "arrangement_failed"
    | "arrangement_paused"
    | "outside_effective_period"
    | "method_unusable"
    | "merchant_not_ready"
    | "nothing_due"
    | "exceeds_authorized_maximum"
    | "retry_not_yet_due"
    | "retry_window_exhausted";

export const AUTOPAY_ATTENTION_REASONS: ReadonlySet<string> = new Set<AutopayNoCollectionReason>([
    "method_unusable",
    "merchant_not_ready",
    "exceeds_authorized_maximum",
    "retry_window_exhausted",
    "arrangement_failed",
]);

function addDays(iso: string, days: number): string {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Whole business days between two dates, weekends excluded. Holidays are not modelled in V1. */
export function businessDaysBetween(fromIso: string, toIso: string): number {
    const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
    const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return 0;
    let count = 0;
    const cursor = new Date(from);
    while (cursor < to) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        const day = cursor.getUTCDay();
        if (day !== 0 && day !== 6) count += 1;
    }
    return count;
}

/**
 * May this arrangement be retried right now?
 *
 * Three independent bounds, and each exists because dropping it produces a specific harm: an
 * unbounded count would hammer a family's account, an unbounded window would charge them six months
 * after they left, and ACH spacing below three business days would incur return fees on money that
 * had not had time to settle.
 */
export function retryAdmission(
    arrangement: AutopayArrangement,
    rail: "card" | "ach",
    asOf: string,
): { allowed: true } | { allowed: false; reason: AutopayNoCollectionReason } {
    if (arrangement.failureCount <= 0) return { allowed: true };
    if (arrangement.failureCount > AUTOPAY_MAX_RETRIES) {
        return { allowed: false, reason: "retry_window_exhausted" };
    }
    const first = t(arrangement.metadata?.first_failure_at as unknown) || t(arrangement.lastAttemptAt);
    if (first && asOf > addDays(first, AUTOPAY_RETRY_WINDOW_DAYS)) {
        return { allowed: false, reason: "retry_window_exhausted" };
    }
    if (rail === "ach" && arrangement.lastAttemptAt) {
        if (businessDaysBetween(arrangement.lastAttemptAt, asOf) < ACH_RETRY_MIN_BUSINESS_DAYS) {
            return { allowed: false, reason: "retry_not_yet_due" };
        }
    }
    return { allowed: true };
}

function noCollection(
    reason: AutopayNoCollectionReason,
    detail: Record<string, unknown> = {},
    nextDueAt: string | null | undefined = undefined,
): ScheduledWorkOutcome {
    return {
        kind: "completed",
        reason: `autopay: ${reason}`,
        diagnostic: { domain: "autopay", collected: false, no_collection_reason: reason, ...detail },
        ...(nextDueAt === undefined ? {} : { nextDueAt }),
    };
}

export type AutopayHandlerDeps = {
    supabase: SupabaseClient;
    /** Injected so tests and the runtime agree on "now" without patching the clock. */
    now?: () => Date;
    collect?: typeof createCardCollection;
    /**
     * The final-admission read. Injectable for the same reason `collect` is: these tests are about
     * what the handler DECIDES given a collectible, and the resolver has its own suite proving how
     * that figure is derived. Neither stands in for the other.
     */
    resolveCollectible?: typeof resolveAutopayCollectible;
};

/**
 * Evaluate one Autopay occurrence.
 *
 * `domainRef` is the opaque payload the scheduler stored and handed back untouched. Autopay puts
 * exactly one thing in it — which arrangement this schedule is for — because anything else stored
 * there would be a snapshot, and a snapshot is the thing this handler exists to avoid trusting.
 */
export async function evaluateAutopayOccurrence(
    ctx: ScheduledWorkContext,
    deps: AutopayHandlerDeps,
): Promise<ScheduledWorkOutcome> {
    const supabase = deps.supabase;
    const now = (deps.now ?? (() => new Date()))();
    const asOf = now.toISOString().slice(0, 10);
    const collect = deps.collect ?? createCardCollection;

    const arrangementId = t((ctx.domainRef ?? {}).arrangement_id);
    const orgId = t(ctx.orgId);
    if (!arrangementId || !orgId) {
        // The row named work this handler cannot locate. Not retryable — a second try reads the
        // same empty reference.
        return {
            kind: "terminal_failure",
            reason: "autopay: occurrence carries no arrangement reference",
            diagnostic: { domain: "autopay", collected: false },
        };
    }

    const arrangement = await readArrangementById(supabase, { orgId, arrangementId });
    if (!arrangement) return noCollection("arrangement_missing", { arrangement_id: arrangementId }, null);

    // ── 1. THE AUTHORIZATION ITSELF ──
    if (arrangement.status === "revoked") return noCollection("arrangement_revoked", {}, null);
    if (arrangement.status === "failed") return noCollection("arrangement_failed", {}, null);
    if (arrangement.status === "paused") {
        // Still live: the schedule is kept, it simply collects nothing today.
        return noCollection("arrangement_paused");
    }

    // ── 2. THE EFFECTIVE PERIOD ──
    if (asOf < arrangement.effectiveFrom) {
        return noCollection("outside_effective_period", { effective_from: arrangement.effectiveFrom });
    }
    if (arrangement.effectiveTo && asOf > arrangement.effectiveTo) {
        // The authorization has run out. It will never collect again, so wind the schedule down.
        return noCollection("outside_effective_period", { effective_to: arrangement.effectiveTo }, null);
    }

    // ── 3. THE PAYMENT METHOD ──
    const { data: methodRow } = await supabase
        .from("payment_methods")
        .select("id, usability_state, rail")
        .eq("org_id", orgId)
        .eq("id", arrangement.paymentMethodId)
        .maybeSingle();
    const method = methodRow as Record<string, unknown> | null;
    const rail: "card" | "ach" = t(method?.rail) === "ach" ? "ach" : "card";
    if (!method || t(method.usability_state) !== "usable") {
        /*
         * The instrument behind the consent is gone. There is no fallback to another method: the
         * payer authorized ONE, and choosing a different one for them is not a consent Alloy holds.
         */
        await failAutopay(supabase, {
            orgId,
            arrangementId,
            reason: "The authorized payment method can no longer be charged.",
        });
        return noCollection("method_unusable", { usability_state: t(method?.usability_state) || "missing" }, null);
    }

    // ── 4. THE MERCHANT ──
    const { data: merchantRow } = await supabase
        .from("payment_provider_merchants")
        .select("readiness, ach_readiness, is_active")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
    const merchant = merchantRow as Record<string, unknown> | null;
    const merchantReady = t(merchant?.readiness) === "ready"
        && (rail !== "ach" || t(merchant?.ach_readiness) === "ready");
    if (!merchantReady) {
        // The organisation's problem, not the family's. The arrangement stays live and tries again.
        return noCollection("merchant_not_ready", {
            readiness: t(merchant?.readiness) || "none",
            ach_readiness: t(merchant?.ach_readiness) || "none",
            rail,
        });
    }

    // ── 5. PAYMENTS' OWN RETRY ADMISSION (never the scheduler's) ──
    const retry = retryAdmission(arrangement, rail, asOf);
    if (!retry.allowed) {
        if (retry.reason === "retry_window_exhausted") {
            await failAutopay(supabase, {
                orgId,
                arrangementId,
                reason: "Autopay stopped after repeated failed collections.",
            });
            return noCollection("retry_window_exhausted", { failure_count: arrangement.failureCount }, null);
        }
        return noCollection(retry.reason, { failure_count: arrangement.failureCount });
    }

    // ── 6. FINAL ADMISSION: WHAT IS CURRENTLY OWED, READ LAST ──
    const resolveCollectible = deps.resolveCollectible ?? resolveAutopayCollectible;
    const collectible = await resolveCollectible(supabase, {
        orgId,
        customerId: arrangement.customerId,
        timingOffsetDays: arrangement.timingOffsetDays,
        asOf,
    });

    if (collectible.totalCents <= 0) {
        /*
         * Nothing due. This is the single most common healthy outcome, and the case that proves the
         * no-shadow-balance rule: an operator recording a cheque an hour ago lands here.
         */
        return noCollection("nothing_due", { next_due_date: collectible.nextDueDate });
    }

    // ── 7. THE CEILING ──
    if (arrangement.maxAmountCents != null && collectible.totalCents > arrangement.maxAmountCents) {
        /*
         * NOT a partial collection. Collecting the maximum would be Alloy inventing a payment plan
         * the payer never agreed to; the honest act is to collect nothing and say why.
         */
        await recordAutopayAttempt(supabase, {
            orgId,
            arrangementId,
            at: now.toISOString(),
            failureReason: "Amount due exceeds the Autopay authorization.",
            incrementFailure: false,
            failureCount: arrangement.failureCount,
            metadata: arrangement.metadata,
        });
        return noCollection("exceeds_authorized_maximum", {
            collectible_cents: collectible.totalCents,
            max_amount_cents: arrangement.maxAmountCents,
        });
    }

    // ── 8. ORDINARY W3 COLLECTION ──
    const collected: Array<{ chargeId: string; attemptId: string; amountCents: number; reused: boolean }> = [];
    const refused: Array<{ chargeId: string; reason: string }> = [];

    for (const charge of collectible.charges) {
        const result = await collect(supabase, {
            orgId,
            chargeId: charge.chargeId,
            requestedAmountCents: charge.outstandingCents,
            payerPersonId: arrangement.payerEntityId,
            rail,
            paymentMethodId: arrangement.paymentMethodId,
        });
        if (result.ok) {
            collected.push({
                chargeId: charge.chargeId,
                attemptId: result.attemptId,
                amountCents: result.amountCents,
                reused: result.reused,
            });
        } else {
            refused.push({ chargeId: charge.chargeId, reason: result.reason });
        }
    }

    const anyCollected = collected.length > 0;
    await recordAutopayAttempt(supabase, {
        orgId,
        arrangementId,
        at: now.toISOString(),
        failureReason: anyCollected ? null : (refused[0]?.reason ?? "No collection attempt succeeded."),
        incrementFailure: !anyCollected,
        failureCount: arrangement.failureCount,
        metadata: arrangement.metadata,
    });

    if (!anyCollected) {
        /*
         * Every attempt was refused by W3. That is a PAYMENT failure, so Payments counts it and will
         * try again on its own cadence — it is not handed to the generic runtime to retry, because
         * the runtime would retry in sixty seconds against the same declined card.
         */
        return {
            kind: "completed",
            reason: "autopay: collection refused",
            diagnostic: {
                domain: "autopay",
                collected: false,
                no_collection_reason: "collection_refused",
                refusals: refused,
                failure_count: arrangement.failureCount + 1,
            },
        };
    }

    return {
        kind: "completed",
        reason: `autopay: ${collected.length} collection attempt(s) created`,
        diagnostic: {
            domain: "autopay",
            collected: true,
            attempts: collected,
            refusals: refused,
            total_cents: collected.reduce((s, c) => s + c.amountCents, 0),
            rail,
        },
    };
}
