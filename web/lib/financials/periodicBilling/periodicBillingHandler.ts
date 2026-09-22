/**
 * THE REGISTERED FINANCIALS HANDLER the generic scheduler dispatches.
 *
 * Its whole job is translation: a scheduled occurrence in, a domain evaluation out, and a
 * scheduler outcome that carries the domain's own answer without the scheduler having to
 * understand it. Every financial decision belongs to `evaluatePeriodicBilling`, and every
 * financial WRITE belongs to `generateTuitionCharges` beneath it.
 *
 * ── A DOMAIN NO-OP AND A DOMAIN REFUSAL ARE BOTH `completed` ──────────────────────────────────
 *
 * The runtime's contract says so explicitly, and it is right: the scheduler DID execute. Billing
 * finding nothing due, and Billing refusing an over-bound backlog, are both successful executions
 * that mutated nothing. Reporting either as a scheduler failure would fill the failure surface
 * with healthy days and teach an operator to stop reading it. What must not happen is the refusal
 * vanishing into a bare "completed" — so the reason and the full outstanding-period detail travel
 * in the outcome, where the attempt record keeps them.
 *
 * ── AN OCCURRENCE WITH NO TENANT BILLS NOTHING ────────────────────────────────────────────────
 *
 * `scheduled_work.org_id` is nullable and at least one platform-level row already exists — the
 * clock activation probe, seeded precisely BECAUSE this handler was non-mutating at the time. The
 * moment the body becomes real that row would wake it again, so an occurrence carrying no tenant
 * answers "no work" and writes nothing rather than interpreting null as "every organization".
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ScheduledWorkContext, ScheduledWorkOutcome } from "@/lib/scheduledWork/scheduledWorkTypes";
import {
    AUTOMATIC_CATCH_UP_PERIOD_LIMIT,
    evaluatePeriodicBilling,
    type PeriodicBillingEvaluation,
} from "@/lib/financials/periodicBilling/evaluatePeriodicBilling";

export type PeriodicBillingHandlerDeps = {
    supabase: SupabaseClient;
    /** Injectable so a test can drive a fixed operating day. */
    now?: () => Date;
};

function trimmed(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

/** §15 — what an operator needs in order to act, and nothing about leases. */
function observability(evaluation: PeriodicBillingEvaluation) {
    const overBound = evaluation.outcomes.filter((o) => o.kind === "catch_up_requires_operator");
    return {
        domain: "periodic_billing",
        evaluated_for: evaluation.todayYmd,
        org_id: evaluation.orgId,
        assignments_considered: evaluation.assignmentsConsidered,
        automatic_catch_up_limit: AUTOMATIC_CATCH_UP_PERIOD_LIMIT,
        counts: evaluation.counts,
        periods_billed: evaluation.outcomes.flatMap((o) => o.periodsProcessed),
        requires_operator: overBound.map((o) => ({
            opportunity_customer_member_id: o.opportunityCustomerMemberId,
            outstanding_periods: o.outstandingPeriods,
            oldest_outstanding_period: o.oldestOutstandingPeriod,
            newest_outstanding_period: o.newestOutstandingPeriod,
            automatic_catch_up_limit: o.automaticCatchUpLimit,
            financial_mutation_performed: false,
            operator_action: o.operatorAction,
        })),
    };
}

export async function evaluatePeriodicBillingOccurrence(
    ctx: ScheduledWorkContext,
    deps: PeriodicBillingHandlerDeps,
): Promise<ScheduledWorkOutcome> {
    const orgId = trimmed(ctx.orgId);
    if (!orgId) {
        return {
            kind: "completed",
            reason: "periodic billing: occurrence carries no organization; nothing was billed",
            diagnostic: {
                domain: "periodic_billing",
                evaluated_for: ctx.dueAt,
                org_id: null,
                assignments_considered: 0,
                automatic_catch_up_limit: AUTOMATIC_CATCH_UP_PERIOD_LIMIT,
                financial_mutation_performed: false,
            },
        };
    }

    const now = (deps.now ?? (() => new Date()))();
    const todayYmd = now.toISOString().slice(0, 10);

    const evaluation = await evaluatePeriodicBilling(deps.supabase, { orgId, todayYmd });
    const diagnostic = observability(evaluation);
    const { counts } = evaluation;

    if (counts.catch_up_requires_operator > 0) {
        /*
         * Completed, and unmistakably not converged. The scheduler's job succeeded; the money did
         * not move; the periods stay outstanding and will be found outstanding again next wake.
         */
        return {
            kind: "completed",
            reason:
                `periodic billing: ${counts.catch_up_requires_operator} assignment(s) exceed the `
                + `${AUTOMATIC_CATCH_UP_PERIOD_LIMIT}-period automatic catch-up limit and were not billed`,
            diagnostic,
        };
    }
    if (counts.configuration_refused > 0 && counts.normal_period_processed + counts.short_catch_up_processed === 0) {
        return {
            kind: "completed",
            reason: `periodic billing: ${counts.configuration_refused} assignment(s) refused for configuration`,
            diagnostic,
        };
    }
    const billed = counts.normal_period_processed + counts.short_catch_up_processed;
    return {
        kind: "completed",
        reason: billed > 0
            ? `periodic billing: ${billed} assignment(s) billed`
            : "periodic billing: no work due",
        diagnostic,
    };
}
