/**
 * AUTOMATIC COMMERCIAL CLOSE — the registered handler, and nothing more than translation.
 *
 * A scheduled occurrence comes in; eligible open periods are discovered; each is closed through the
 * SAME `closeBillingPeriod` service an operator uses. There is no second close implementation here,
 * and that is the whole design: finality has one set of rules, and "who asked" is a parameter
 * (`close_actor`) rather than a separate code path.
 *
 * ── WHY IT CLOSES ONE AT A TIME ──
 *
 * A period is one customer's commercial fact. Closing them in a loop, each through the authority,
 * means one failure cannot take the others with it and the attempt record can say exactly which
 * customers were finalized. A bulk UPDATE would be faster and would lose both properties.
 *
 * ── A NO-OP IS A SUCCESS ──
 *
 * The runtime's contract is explicit and correct: the scheduler DID execute. Finding nothing
 * elapsed is a healthy day, not a failure. Reporting it as failure would fill the operator's
 * failure surface with ordinary days and teach them to stop reading it.
 *
 * ── AN OCCURRENCE WITH NO TENANT CLOSES NOTHING ──
 *
 * `scheduled_work.org_id` is nullable and a platform-level row already exists. Null means "no
 * tenant", never "every organisation" — a scheduler row must not be able to finalize the commercial
 * periods of an org nobody named.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import {
    BillingPeriodCloseError,
    closeBillingPeriod,
    findClosableBillingPeriods,
} from "@/lib/financials/billingPeriods/closeBillingPeriod";
import type { ScheduledWorkContext, ScheduledWorkOutcome } from "@/lib/scheduledWork/scheduledWorkTypes";

export type BillingPeriodCloseHandlerDeps = {
    supabase: SupabaseClient;
    /** Injectable so a test can drive a fixed operating day. Production resolves the org's own. */
    todayYmd?: string;
    /** Bounded per occurrence, so a large backlog drains across wakes rather than in one attempt. */
    limit?: number;
};

export const AUTOMATIC_CLOSE_PERIOD_LIMIT = 100;

export async function evaluateBillingPeriodCloseOccurrence(
    ctx: ScheduledWorkContext,
    deps: BillingPeriodCloseHandlerDeps,
): Promise<ScheduledWorkOutcome> {
    const orgId = (ctx.orgId ?? "").trim();
    if (!orgId) {
        return {
            kind: "completed",
            reason: "no tenant on this occurrence; nothing to close",
            diagnostic: { domain: "billing_period_close", org_id: null, evaluated_for: ctx.dueAt },
        };
    }

    const limit = deps.limit ?? AUTOMATIC_CLOSE_PERIOD_LIMIT;
    let todayYmd: string;
    let closable: Array<{ id: string; customer_id: string; period_key: string; ends_on: string }>;
    try {
        todayYmd = deps.todayYmd ?? (await resolveOperationalEnrollmentTodayYmd(deps.supabase, orgId));
        closable = await findClosableBillingPeriods(deps.supabase, { orgId, todayYmd, limit });
    } catch (error) {
        /*
         * Discovery failed, so we do not know what was eligible. RETRYABLE: the clock will ask
         * again, and nothing has been closed, so a retry cannot double-finalize anything.
         */
        return {
            kind: "retryable_failure",
            reason: "could not determine which billing periods are eligible to close",
            diagnostic: {
                domain: "billing_period_close",
                org_id: orgId,
                error_code: error instanceof BillingPeriodCloseError ? error.code : "unknown",
            },
        };
    }

    const closed: Array<{ billing_period_id: string; customer_id: string; period_key: string }> = [];
    const alreadyClosed: string[] = [];
    const refused: Array<{ billing_period_id: string; code: string }> = [];

    for (const period of closable) {
        try {
            const result = await closeBillingPeriod(deps.supabase, {
                orgId,
                billingPeriodId: period.id,
                /* SYSTEM. No `actorUserId` — an automatic close is attributed to nobody, and the
                 * service and the database both refuse one that tries to name a person. */
                closeActor: "system",
                todayYmd,
            });
            if (result.transitioned) {
                closed.push({
                    billing_period_id: result.billingPeriodId,
                    customer_id: result.customerId,
                    period_key: result.periodKey,
                });
            } else {
                /* Already closed — an operator or a previous attempt got there first. Not an error. */
                alreadyClosed.push(result.billingPeriodId);
            }
        } catch (error) {
            /*
             * One customer's period refused. The others are independent, so the loop continues and
             * the refusal is REPORTED rather than thrown: the occurrence genuinely did the work it
             * could, and an operator needs to see which period did not close and why.
             */
            refused.push({
                billing_period_id: period.id,
                code: error instanceof BillingPeriodCloseError ? error.code : "unknown",
            });
        }
    }

    const diagnostic = {
        domain: "billing_period_close",
        org_id: orgId,
        evaluated_for: todayYmd,
        attempt: ctx.attemptNumber,
        worker_id: ctx.workerId,
        eligible_found: closable.length,
        limit,
        closed_count: closed.length,
        closed,
        already_closed: alreadyClosed,
        refused,
    };

    if (closable.length === 0) {
        return { kind: "completed", reason: "no billing period has finished its interval", diagnostic };
    }

    /*
     * Refusals do not fail the occurrence. The scheduler executed; the domain answered. A bare
     * "completed" that hid them would be the real problem, so they travel in the diagnostic where
     * the attempt record keeps them.
     */
    return {
        kind: "completed",
        reason:
            `closed ${closed.length} billing period(s)`
            + (alreadyClosed.length ? `; ${alreadyClosed.length} already closed` : "")
            + (refused.length ? `; ${refused.length} refused` : ""),
        diagnostic,
    };
}
