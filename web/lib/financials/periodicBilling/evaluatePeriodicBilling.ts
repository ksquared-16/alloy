/**
 * AUTOMATIC PERIODIC BILLING — the domain evaluation the scheduler wakes.
 *
 * The scheduler knows when. This knows what, and everything financial it does it does by calling
 * the same `generateTuitionCharges` an operator's Generate Tuition calls. No price, no period, no
 * cadence and no due-ness rule is computed here that is not already computed there.
 *
 * ── THE BOUND, AND WHY REFUSING IS WHAT MAKES IT A BOUND ──────────────────────────────────────
 *
 * At most TWO canonical Billing Periods per assignment may be mutated automatically. The unit is
 * the canonical period — not days, not months, not charges, not scheduler attempts — so a weekly
 * assignment and a monthly one get the same guarantee over their own commercial grain.
 *
 * Beyond two, NOTHING is billed. Not the newest two, not the oldest two, not one. That total
 * refusal is not severity for its own sake: it is the only shape of the rule that cannot be
 * drained. Bill two of seven and the next wake sees five, bills two, sees three, bills two — the
 * bound evaporates across four wakes and the historical catch-up it existed to prevent happens
 * anyway, just more slowly. Because an over-bound assignment is left entirely untouched, the
 * outstanding set does not shrink, so every later wake reaches the same conclusion until an
 * operator converges the backlog through Generate Tuition. No episode table, no high-water mark
 * and no second scheduler are required to make that true — the absence of mutation is the memory.
 *
 * ── WHY A RETRY CANNOT SPEND THE BOUND TWICE ──────────────────────────────────────────────────
 *
 * The outstanding set is re-read from canonical Financials truth on every attempt. A retry of an
 * attempt that already billed sees those periods converged and answers NO_WORK_DUE; a retry of an
 * attempt that billed nothing sees the same set it saw before. Attempts are not counted, and they
 * are not what the bound is measured in.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { generateTuitionCharges, type TuitionGenerationResult } from "@/lib/financials/tuitionGeneration/generateTuitionCharges";
import {
    readOutstandingBillingPeriods,
    type OutstandingAssignment,
} from "@/lib/financials/periodicBilling/readOutstandingBillingPeriods";

/**
 * N = 2, as canonical Billing Periods per assignment per catch-up episode.
 *
 * Stated as a period count in the one place the rule is applied. A limit expressed in days would
 * mean something different to a weekly assignment than to a monthly one, which is the opposite of
 * what a safety bound is for.
 */
export const AUTOMATIC_CATCH_UP_PERIOD_LIMIT = 2;

export type PeriodicBillingOutcomeKind =
    | "no_work_due"
    | "normal_period_processed"
    | "short_catch_up_processed"
    | "catch_up_requires_operator"
    | "configuration_refused";

export type PeriodicBillingAssignmentOutcome = {
    opportunityCustomerMemberId: string;
    kind: PeriodicBillingOutcomeKind;
    cadenceKey: string;
    /** The COMPLETE outstanding count, never the bounded slice. */
    outstandingPeriods: number;
    oldestOutstandingPeriod: string | null;
    newestOutstandingPeriod: string | null;
    automaticCatchUpLimit: number;
    /** True only where this evaluation actually called canonical generation. */
    mutated: boolean;
    periodsProcessed: string[];
    generatedCount: number;
    unchangedCount: number;
    detail: string | null;
    operatorAction: string | null;
};

export type PeriodicBillingEvaluation = {
    orgId: string | null;
    todayYmd: string;
    assignmentsConsidered: number;
    outcomes: PeriodicBillingAssignmentOutcome[];
    counts: Record<PeriodicBillingOutcomeKind, number>;
};

function emptyCounts(): Record<PeriodicBillingOutcomeKind, number> {
    return {
        no_work_due: 0,
        normal_period_processed: 0,
        short_catch_up_processed: 0,
        catch_up_requires_operator: 0,
        configuration_refused: 0,
    };
}

/** The `YYYY-MM` spans generation must be asked for to cover these periods. */
function spansCovering(periods: readonly { start: string; end: string }[]): string[] {
    const spans = new Set<string>();
    for (const p of periods) {
        /*
         * A weekly period can straddle a month end, and it is ONE commercial period. Both months
         * are asked for so the period is reached whichever side of the boundary it is tiled from;
         * generation converges on the period either way, so asking twice cannot bill twice.
         */
        spans.add(p.start.slice(0, 7));
        spans.add(p.end.slice(0, 7));
    }
    return [...spans].sort();
}

function summarise(a: OutstandingAssignment): { oldest: string | null; newest: string | null } {
    if (a.outstanding.length === 0) return { oldest: null, newest: null };
    return {
        oldest: a.outstanding[0]!.periodKey,
        newest: a.outstanding[a.outstanding.length - 1]!.periodKey,
    };
}

/**
 * The one way this evaluation is allowed to move money.
 *
 * Injectable ONLY so the bound can be locked behaviourally — a test drives the rule and records
 * whether generation was called, for which assignment, for which spans. The default is the
 * canonical authority and there is no second implementation of it anywhere; a caller supplying its
 * own is a test harness, not a second billing engine, and the locks assert the default.
 */
export type PeriodicBillingGenerate = typeof generateTuitionCharges;

export async function evaluatePeriodicBilling(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        todayYmd: string;
        opportunityCustomerMemberIds?: readonly string[] | null;
        generate?: PeriodicBillingGenerate;
    },
): Promise<PeriodicBillingEvaluation> {
    const generate: PeriodicBillingGenerate = args.generate ?? generateTuitionCharges;
    const truth = await readOutstandingBillingPeriods(supabase, args);
    const outcomes: PeriodicBillingAssignmentOutcome[] = [];
    const counts = emptyCounts();

    for (const assignment of truth.assignments) {
        const { oldest, newest } = summarise(assignment);
        const outstandingPeriods = assignment.outstanding.length;
        const base = {
            opportunityCustomerMemberId: assignment.opportunityCustomerMemberId,
            cadenceKey: assignment.cadenceKey,
            outstandingPeriods,
            oldestOutstandingPeriod: oldest,
            newestOutstandingPeriod: newest,
            automaticCatchUpLimit: AUTOMATIC_CATCH_UP_PERIOD_LIMIT,
        };

        if (assignment.refusals.length > 0) {
            outcomes.push({
                ...base,
                kind: "configuration_refused",
                mutated: false,
                periodsProcessed: [],
                generatedCount: 0,
                unchangedCount: 0,
                detail: assignment.refusals[0]!.detail,
                operatorAction: "Resolve the configuration, then run Generate Tuition for the affected periods.",
            });
            counts.configuration_refused += 1;
            continue;
        }

        if (outstandingPeriods === 0) {
            outcomes.push({
                ...base, kind: "no_work_due", mutated: false, periodsProcessed: [],
                generatedCount: 0, unchangedCount: 0, detail: null, operatorAction: null,
            });
            counts.no_work_due += 1;
            continue;
        }

        if (outstandingPeriods > AUTOMATIC_CATCH_UP_PERIOD_LIMIT) {
            /*
             * NOTHING IS BILLED, and the whole backlog stays visible. Advancing any state here —
             * a cursor, a mark, a "handled" flag — would turn unresolved money into a record that
             * says it was dealt with, which is the one failure an operator cannot recover from by
             * looking.
             */
            outcomes.push({
                ...base,
                kind: "catch_up_requires_operator",
                mutated: false,
                periodsProcessed: [],
                generatedCount: 0,
                unchangedCount: 0,
                detail:
                    `${outstandingPeriods} canonical billing periods are due and unbilled for this assignment `
                    + `(${oldest} through ${newest}). Automatic billing converges at most `
                    + `${AUTOMATIC_CATCH_UP_PERIOD_LIMIT} periods, so none were billed automatically.`,
                operatorAction: "Converge these periods with Generate Tuition; automatic billing resumes once the outstanding set is within the limit.",
            });
            counts.catch_up_requires_operator += 1;
            continue;
        }

        /* Within the bound: the canonical authority does the billing, for this assignment only. */
        /*
         * THE SPAN SAYS WHERE TO LOOK; THE PERIOD KEYS SAY WHAT TO BILL.
         *
         * Asking for a month and taking whatever it contains billed periods that had not begun —
         * measured on deployed staging, a one-period specimen received charges for 2026-09-22 AND
         * 2026-09-29, and a two-period one received three. The bound was computed on the
         * outstanding set and then applied to a larger set, which is the bound not holding.
         *
         * So the exact periods this evaluation decided are due travel with the request.
         */
        const dueKeys = assignment.outstanding.map((p) => p.periodKey);
        const results: TuitionGenerationResult[] = [];
        for (const span of spansCovering(assignment.outstanding)) {
            results.push(await generate(supabase, {
                orgId: args.orgId,
                periodKey: span,
                cadenceKey: assignment.cadenceKey,
                opportunityCustomerMemberIds: [assignment.opportunityCustomerMemberId],
                periodKeys: dueKeys,
                today: truth.todayYmd,
            }));
        }
        const generatedCount = results.reduce((n, r) => n + r.counts.generated, 0);
        const unchangedCount = results.reduce((n, r) => n + r.counts.unchanged + r.counts.alreadyPosted, 0);
        const kind: PeriodicBillingOutcomeKind =
            outstandingPeriods === 1 ? "normal_period_processed" : "short_catch_up_processed";
        outcomes.push({
            ...base,
            kind,
            mutated: true,
            periodsProcessed: assignment.outstanding.map((p) => p.periodKey),
            generatedCount,
            unchangedCount,
            detail: null,
            operatorAction: null,
        });
        counts[kind] += 1;
    }

    return {
        orgId: truth.orgId,
        todayYmd: truth.todayYmd,
        assignmentsConsidered: truth.assignments.length,
        outcomes,
        counts,
    };
}
