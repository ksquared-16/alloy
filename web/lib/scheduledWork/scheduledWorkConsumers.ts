import { evaluateAutopayOccurrence } from "@/lib/financials/payments/autopayHandler";
import { registerScheduledWorkHandler } from "@/lib/scheduledWork/scheduledWorkRegistry";
import type { ScheduledWorkContext, ScheduledWorkOutcome } from "@/lib/scheduledWork/scheduledWorkTypes";
import {
    AUTOPAY_HANDLER_KEY,
    BILLING_PERIODIC_HANDLER_KEY,
    CHARGE_AGING_HANDLER_KEY,
} from "@/lib/scheduledWork/scheduledWorkHandlerKeys";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * THE THREE V1 CONSUMERS, registered at the same boundary.
 *
 * The point of certifying three is that ONE runtime serves them. Everything above
 * this file is generic; everything a domain means begins inside its handler.
 *
 * ── WHAT THESE HANDLERS DO AND DO NOT DO IN V1 ──
 *
 * Periodic Billing and Charge Aging economics are NOT productized here, and
 * inventing them to demonstrate scheduling would be worse than a stated
 * limitation — it would put fabricated financial behaviour behind a real clock.
 *
 * AUTOPAY IS the exception, and now the proof: Payments V1 W5 replaced its body
 * with the real implementation and nothing above this file changed.
 *
 * So the two remaining stubs cross the exact registered-handler boundary their real
 * implementations will, receive the same context, return the same structured
 * outcome, and perform a NON-MUTATING evaluation. What was certified is the
 * boundary and the runtime, not billing arithmetic. When Financials productizes
 * its mutations it replaces those bodies, and nothing above this file changes —
 * which is no longer a prediction, because Autopay has now done exactly that.
 *
 * Each returns COMPLETED for a no-op, which is the contract's most easily
 * mistaken rule: "evaluated, nothing was due" is a successful run, not a failure.
 */

/* Declared in a leaf module so a domain can name its key without importing this one. */
export {
    BILLING_PERIODIC_HANDLER_KEY,
    CHARGE_AGING_HANDLER_KEY,
    AUTOPAY_HANDLER_KEY,
} from "@/lib/scheduledWork/scheduledWorkHandlerKeys";

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

    /*
     * AUTOPAY IS PRODUCTIZED (Payments V1 W5). It is no longer an evaluation stub.
     *
     * The seam is unchanged and that is the point: the same key, the same context, the same
     * structured outcome. What changed is only the body, exactly as this file predicted.
     *
     * The client is built HERE rather than inside the handler so the handler stays injectable —
     * its tests drive it with a fake client and a fixed clock, and nothing about it needs the
     * service-role environment to be readable.
     */
    registerScheduledWorkHandler(AUTOPAY_HANDLER_KEY, async (ctx) =>
        evaluateAutopayOccurrence(ctx, { supabase: createAdminClient() }),
    );
}

/** Registration is idempotent at module scope, and the registry refuses doubles. */
let registered = false;
export function ensureScheduledWorkConsumersRegistered(): void {
    if (registered) return;
    registerScheduledWorkConsumers();
    registered = true;
}
