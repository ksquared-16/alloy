/**
 * WHAT A GENERATION RUN WOULD DO — the same decisions, reported instead of written.
 *
 * It shares `resolveTuitionRecurrence` and the same term and policy reads with the real run, so a
 * preview cannot describe a different act than the one that follows it. What it does NOT share is
 * the write: no consumption event, no obligation, no charge.
 *
 * The one thing it cannot see is a configuration gap that only the pipeline discovers — a missing
 * tuition charge template surfaces at generation, not here — so a preview counting work to do is not
 * a promise that the organisation is configured to do it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { listFinancialPolicies } from "@/lib/financials/policies/financialPolicyService";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
import { readAcceptedPricingTerms } from "@/lib/enrollment/pricing/enrollmentPricingTermsService";
import {
    resolveTuitionRecurrence,
    type ProrationMethod,
} from "@/lib/financials/tuitionGeneration/resolveTuitionRecurrence";
import type { TuitionGenerationOutcome, TuitionGenerationResult } from "@/lib/financials/tuitionGeneration/generateTuitionCharges";

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

    const allTerms = await readAcceptedPricingTerms(supabase, { orgId: args.orgId });
    const scope = args.opportunityCustomerMemberIds?.length
        ? new Set(args.opportunityCustomerMemberIds)
        : null;
    const terms = scope ? allTerms.filter((t) => scope.has(t.opportunityCustomerMemberId)) : allTerms;

    const policies = await listFinancialPolicies(supabase, args.orgId);
    const proration = resolveFinancialPolicy(policies, "proration", {}, `${periodKey}-01`);
    const prorationMethod = (proration.resolved
        ? ((proration.policy.value as { method?: string }).method ?? "none")
        : "none") as ProrationMethod;

    const byAssignment = new Map<string, typeof terms>();
    for (const t of terms) {
        const list = byAssignment.get(t.opportunityCustomerMemberId) ?? [];
        list.push(t);
        byAssignment.set(t.opportunityCustomerMemberId, list);
    }

    const outcomes: TuitionGenerationOutcome[] = [];
    for (const [assignmentId, assignmentTerms] of byAssignment) {
        const d = resolveTuitionRecurrence({ terms: assignmentTerms, periodKey, prorationMethod, cadenceKey });
        if (d.kind === "not_due") {
            outcomes.push({ kind: "not_due", assignmentId, reason: d.reason });
        } else if (d.kind === "refused") {
            outcomes.push({ kind: "refused", assignmentId, reason: d.reason, detail: d.detail });
        } else if (!d.term.enrollmentAgreementId) {
            outcomes.push({ kind: "not_due", assignmentId, reason: "assignment_not_enrolled" });
        } else {
            outcomes.push({
                kind: "generated",
                assignmentId,
                termId: d.term.termId,
                chargeId: null,
                amountCents: d.amountCents,
                currencyCode: d.currencyCode,
                obligationId: null,
            });
        }
    }

    const period = resolveTuitionRecurrence({ terms: [], periodKey }).period;
    return {
        periodKey,
        servicePeriod: { start: period.start, end: period.end },
        counts: {
            generated: outcomes.filter((o) => o.kind === "generated").length,
            notDue: outcomes.filter((o) => o.kind === "not_due").length,
            refused: outcomes.filter((o) => o.kind === "refused").length,
            errors: 0,
        },
        outcomes,
    };
}
