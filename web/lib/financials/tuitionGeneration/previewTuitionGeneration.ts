/**
 * WHAT A GENERATION RUN WOULD DO — the same decisions, reported instead of written.
 *
 * It shares `resolveTuitionRecurrence` and the same term and policy reads with the real run, so a
 * preview cannot describe a different act than the one that follows it. What it does NOT share is
 * the write: no consumption event, no obligation, no charge.
 *
 * ── AND IT SHARES CONVERGENCE, WHICH IT USED NOT TO ───────────────────────────────────────────
 *
 * It previously reported `generated` for every due period and hardcoded `unchanged: 0,
 * alreadyPosted: 0`, on the reasoning that a preview writes nothing and so has no converged drafts
 * of its own to report. But the question an operator asks is not "what did this preview create",
 * it is "what would the run do" — and against a period that already carries a charge the run
 * creates nothing. Measured on deployed staging, the preview offered "Generate 5 · $925.00" for
 * five weeks that already had drafts and "Generate 1 · $1,450.00" for a month already POSTED.
 *
 * Convergence now comes from `readTuitionChargeConvergence`, the same fact the outstanding-period
 * reader uses, so the preview's promise and the run's behaviour cannot disagree about what is
 * already billed.
 *
 * The one thing it still cannot see is a configuration gap that only the pipeline discovers — a
 * missing tuition charge template surfaces at generation, not here — so a preview counting work to
 * do is not a promise that the organisation is configured to do it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { listFinancialPolicies } from "@/lib/financials/policies/financialPolicyService";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
import { readAcceptedPricingTerms } from "@/lib/enrollment/pricing/enrollmentPricingTermsService";
import {
    resolveTuitionRecurrence,
    type ProrationMethod,
} from "@/lib/financials/tuitionGeneration/resolveTuitionRecurrence";
import {
    assignmentBillingPeriods,
    tallyTuitionOutcomes,
    type TuitionGenerationOutcome,
    type TuitionGenerationResult,
} from "@/lib/financials/tuitionGeneration/generateTuitionCharges";
import {
    billingPeriodFromKey,
    isPeriodBillableCadence,
    type BillingCadence,
} from "@/lib/financials/billingPeriod";
import {
    readTuitionChargeConvergence,
    tuitionConvergenceKey,
} from "@/lib/financials/tuitionGeneration/tuitionChargeConvergence";

export async function previewTuitionGeneration(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        periodKey: string;
        opportunityCustomerMemberIds?: readonly string[] | null;
        cadenceKey?: string;
    },
): Promise<TuitionGenerationResult> {
    const periodKey = args.periodKey.trim();
    if (!/^\d{4}-\d{2}$/.test(periodKey)) throw new Error("period_key must be YYYY-MM");
    const cadenceKey = (args.cadenceKey ?? "monthly").trim();
    const span = billingPeriodFromKey(periodKey);
    if (!isPeriodBillableCadence(cadenceKey)) {
        // Usage-priced cadences have no interval to preview — the same refusal generation gives.
        return {
            periodKey,
            servicePeriod: { start: span.start, end: span.end },
            cadenceKey,
            periodsBilled: [],
            counts: { generated: 0, unchanged: 0, notDue: 0, refused: 0, alreadyPosted: 0, errors: 0 },
            outcomes: [],
        };
    }
    const cadence: BillingCadence = cadenceKey;

    const allTerms = await readAcceptedPricingTerms(supabase, { orgId: args.orgId });
    const scope = args.opportunityCustomerMemberIds?.length
        ? new Set(args.opportunityCustomerMemberIds)
        : null;
    const terms = scope ? allTerms.filter((t) => scope.has(t.opportunityCustomerMemberId)) : allTerms;

    const policies = await listFinancialPolicies(supabase, args.orgId);
    const proration = resolveFinancialPolicy(policies, "proration", {}, span.start);
    const prorationMethod = (proration.resolved
        ? ((proration.policy.value as { method?: string }).method ?? "none")
        : "none") as ProrationMethod;

    const byAssignment = new Map<string, typeof terms>();
    for (const t of terms) {
        const list = byAssignment.get(t.opportunityCustomerMemberId) ?? [];
        list.push(t);
        byAssignment.set(t.opportunityCustomerMemberId, list);
    }

    /* What is already billed, read once for every agreement in scope. */
    const convergence = await readTuitionChargeConvergence(
        supabase,
        args.orgId,
        terms.map((t) => t.enrollmentAgreementId).filter((id): id is string => Boolean(id)),
    );

    const outcomes: TuitionGenerationOutcome[] = [];
    const billed = new Map<string, { key: string; label: string; start: string; end: string }>();
    for (const [assignmentId, assignmentTerms] of byAssignment) {
        // THE SAME TILING THE RUN WILL USE. Not a second opinion about what September contains.
        for (const period of assignmentBillingPeriods(assignmentTerms, cadence, span)) {
            billed.set(period.key, { key: period.key, label: period.label, start: period.start, end: period.end });
            const periodKeyOf = period.key;
            const periodLabel = period.label;
            const d = resolveTuitionRecurrence({ terms: assignmentTerms, period, prorationMethod, cadenceKey });
            if (d.kind === "not_due") {
                outcomes.push({ kind: "not_due", assignmentId, periodKey: periodKeyOf, periodLabel, reason: d.reason });
            } else if (d.kind === "refused") {
                outcomes.push({ kind: "refused", assignmentId, periodKey: periodKeyOf, periodLabel, reason: d.reason, detail: d.detail });
            } else if (!d.term.enrollmentAgreementId) {
                outcomes.push({ kind: "not_due", assignmentId, periodKey: periodKeyOf, periodLabel, reason: "assignment_not_enrolled" });
            } else {
                const converged = convergence.get(
                    tuitionConvergenceKey(d.term.enrollmentAgreementId, d.serviceDate),
                );
                if (converged?.outcomeKind === "already_posted") {
                    outcomes.push({
                        kind: "already_posted", assignmentId, periodKey: periodKeyOf, periodLabel,
                        termId: d.term.termId, chargeId: converged.chargeId, amountCents: converged.amountCents,
                    });
                } else if (converged) {
                    outcomes.push({
                        kind: "unchanged", assignmentId, periodKey: periodKeyOf, periodLabel,
                        termId: d.term.termId, chargeId: converged.chargeId,
                        amountCents: converged.amountCents, currencyCode: d.currencyCode, obligationId: null,
                    });
                } else {
                    outcomes.push({
                        kind: "generated",
                        assignmentId,
                        periodKey: periodKeyOf,
                        periodLabel,
                        termId: d.term.termId,
                        chargeId: null,
                        amountCents: d.amountCents,
                        currencyCode: d.currencyCode,
                        obligationId: null,
                    });
                }
            }
        }
    }

    return {
        periodKey,
        servicePeriod: { start: span.start, end: span.end },
        cadenceKey,
        periodsBilled: [...billed.values()].sort((a, b) => a.start.localeCompare(b.start)),
        /* Derived from the outcomes, like the run's own tally — never asserted alongside them. */
        counts: tallyTuitionOutcomes(outcomes),
        outcomes,
    };
}
