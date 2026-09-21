import { registerScheduledWorkHandler } from "@/lib/scheduledWork/scheduledWorkRegistry";
import type { ScheduledWorkContext, ScheduledWorkOutcome } from "@/lib/scheduledWork/scheduledWorkTypes";

/**
 * THE THREE V1 CONSUMERS, registered at the same boundary.
 *
 * The point of certifying three is that ONE runtime serves them. Everything above
 * this file is generic; everything a domain means begins inside its handler.
 *
 * ── WHAT THESE HANDLERS DO AND DO NOT DO IN V1 ──
 *
 * Periodic Billing, Charge Aging and Autopay economics are NOT productized here,
 * and inventing them to demonstrate scheduling would be worse than a stated
 * limitation — it would put fabricated financial behaviour behind a real clock.
 *
 * So each handler crosses the exact registered-handler boundary the real one will,
 * receives the same context, returns the same structured outcome, and performs a
 * NON-MUTATING evaluation. What is certified is the boundary and the runtime, not
 * billing arithmetic. When Financials and Payments productize their mutations,
 * they replace the body of these functions and nothing above changes.
 *
 * Each returns COMPLETED for a no-op, which is the contract's most easily
 * mistaken rule: "evaluated, nothing was due" is a successful run, not a failure.
 */

export const BILLING_PERIODIC_HANDLER_KEY = "financials.periodic_billing.evaluate";
export const CHARGE_AGING_HANDLER_KEY = "financials.charge_aging.evaluate";
export const AUTOPAY_HANDLER_KEY = "payments.autopay.evaluate";

/** Shared shape so the three read alike and differ only where they must. */
function evaluated(domain: string, ctx: ScheduledWorkContext): ScheduledWorkOutcome {
    return {
        kind: "completed",
        reason: `${domain} evaluated; no mutation in V1`,
        diagnostic: {
            domain,
            evaluated_for: ctx.dueAt,
            org_id: ctx.orgId,
            attempt: ctx.attemptNumber,
            // Proves the opaque reference survived the round trip untouched.
            domain_ref_keys: Object.keys(ctx.domainRef ?? {}).sort(),
            mutation: "not_productized_v1",
        },
    };
}

export function registerScheduledWorkConsumers(): void {
    registerScheduledWorkHandler(BILLING_PERIODIC_HANDLER_KEY, async (ctx) =>
        // Real implementation resolves the billing period from `domainRef` and
        // raises charges. Until then this asserts only that the seam is reachable.
        evaluated("periodic_billing", ctx),
    );

    registerScheduledWorkHandler(CHARGE_AGING_HANDLER_KEY, async (ctx) =>
        // Real implementation ages open charges and applies late-fee policy.
        evaluated("charge_aging", ctx),
    );

    registerScheduledWorkHandler(AUTOPAY_HANDLER_KEY, async (ctx) =>
        // Real implementation collects an authorized balance. Payments owns its own
        // payment-retry policy; it is NOT the scheduler's bounded infrastructure retry.
        evaluated("autopay", ctx),
    );
}

/** Registration is idempotent at module scope, and the registry refuses doubles. */
let registered = false;
export function ensureScheduledWorkConsumersRegistered(): void {
    if (registered) return;
    registerScheduledWorkConsumers();
    registered = true;
}
