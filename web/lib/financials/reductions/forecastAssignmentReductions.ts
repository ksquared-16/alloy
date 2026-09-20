import type { SupabaseClient } from "@supabase/supabase-js";

import { readPolicies } from "@/lib/commercial/execution/export/readCommercialConfig";
import { billingPeriodBounds } from "@/lib/financials/reductions/reductionPeriod";
import { resolveHouseholdEligibility } from "@/lib/financials/reductions/resolveReductionEligibility";
import {
    resolveFinancialReductions,
    type NotEligibleReason,
    type ReductionPolicy,
    type ReductionPolicyKind,
} from "@/lib/financials/reductions/resolveFinancialReductions";

/**
 * WHAT DISCOUNTS ARE EXPECTED TO APPLY TO THIS COMMERCIAL RELATIONSHIP.
 *
 * ── A PROJECTION, NOT A SECOND ENGINE ─────────────────────────────────────────────────────────
 *
 * Every input comes from the same three places the real application path uses: `readPolicies` for
 * the configuration, `resolveHouseholdEligibility` for the sibling and employment facts, and
 * `resolveFinancialReductions` for the decision. Nothing about eligibility is decided here, and
 * nothing is decided in React — a forecast that reasoned independently would be a second opinion
 * about money, and the first time it disagreed with the ledger the operator would have no way to
 * tell which was wrong.
 *
 * ── IT WRITES NOTHING ─────────────────────────────────────────────────────────────────────────
 *
 * No `financial_reduction_applications` row, no charge, no adjustment, no ledger entry. The gross
 * it reasons about is HYPOTHETICAL — the accepted tuition for one billing period — so the answer
 * is "what would happen", and the only thing that makes it true is the application path later
 * reaching the same conclusion from the same authority.
 */

export type ForecastOutcome =
    | { kind: "expected"; policyId: string; policyKind: ReductionPolicyKind; label: string; amountCents: number; explanation: string }
    | { kind: "not_expected"; reason: NotEligibleReason }
    | { kind: "unavailable"; reason: string };

export type AssignmentReductionForecast = {
    /** The hypothetical gross the projection reasoned about — stated, never hidden. */
    grossCents: number;
    currencyCode: string;
    periodKey: string;
    categoryKey: string;
    outcomes: ForecastOutcome[];
    /** Every reduction the forecast expects, summed. Negative cents. */
    totalCents: number;
    netCents: number;
};

const REDUCTION_KINDS: readonly string[] = ["waiver", "sibling_discount", "discount"];

export async function forecastAssignmentReductions(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        customerId: string;
        customerMemberId: string;
        enrollmentAgreementId: string;
        /** The accepted tuition for one period. A forecast against nothing is not a forecast. */
        grossCents: number;
        currencyCode: string;
        /** The billing period the hypothetical obligation would fall in. */
        periodKey: string;
        categoryKey?: string;
    },
): Promise<AssignmentReductionForecast> {
    const categoryKey = args.categoryKey ?? "tuition";
    const base = {
        grossCents: args.grossCents,
        currencyCode: args.currencyCode,
        periodKey: args.periodKey,
        categoryKey,
    };
    if (args.grossCents <= 0) {
        return { ...base, outcomes: [{ kind: "unavailable", reason: "no_accepted_gross" }], totalCents: 0, netCents: args.grossCents };
    }

    const period = billingPeriodBounds(args.periodKey);
    const allPolicies = await readPolicies({ supabase, orgId: args.orgId } as never);
    /* The same window the application path uses — a policy not yet effective is not a forecast. */
    const active = allPolicies.filter(
        (p) =>
            p.isActive
            && REDUCTION_KINDS.includes(p.kind)
            && (!p.effective.start || p.effective.start <= period.end)
            && (!p.effective.end || p.effective.end >= period.start),
    );
    const policies: ReductionPolicy[] = active.map((p) => ({
        id: p.id,
        kind: p.kind as ReductionPolicyKind,
        params: p.params,
        label: (p.params.label as string | undefined) ?? p.kind,
    }));

    const household = await resolveHouseholdEligibility(supabase, {
        orgId: args.orgId,
        customerId: args.customerId,
        periodStart: period.start,
        periodEnd: period.end,
    });
    const facts = household.byMember.get(args.customerMemberId) ?? {
        siblingRank: 1,
        siblingCount: 1,
        employeeHousehold: household.employeeHousehold,
    };

    const decision = resolveFinancialReductions({
        gross: {
            /*
             * A FORECAST HAS NO CHARGE. The resolver needs an identity for the gross it is
             * reasoning about and uses it only to key the reduction; a forecast keys nothing
             * because it writes nothing, so the assignment's own agreement stands in and no
             * charge id is invented that something might later mistake for a real one.
             */
            chargeId: `forecast:${args.enrollmentAgreementId}:${args.periodKey}`,
            customerMemberId: args.customerMemberId,
            enrollmentAgreementId: args.enrollmentAgreementId,
            amountCents: args.grossCents,
            currencyCode: args.currencyCode,
            categoryKey,
            periodKey: args.periodKey,
        },
        policies,
        facts,
    });

    if (decision.kind === "applied") {
        return {
            ...base,
            outcomes: decision.reductions.map((r) => ({
                kind: "expected" as const,
                policyId: r.policyId,
                policyKind: r.policyKind,
                label: policies.find((p) => p.id === r.policyId)?.label ?? r.policyKind,
                amountCents: r.amountCents,
                explanation: r.explanation,
            })),
            totalCents: decision.totalCents,
            netCents: decision.netCents,
        };
    }
    if (decision.kind === "not_eligible") {
        /* The domain's own reason, never a UI-only vocabulary invented beside it. */
        return { ...base, outcomes: [{ kind: "not_expected", reason: decision.reason }], totalCents: 0, netCents: args.grossCents };
    }
    return { ...base, outcomes: [{ kind: "unavailable", reason: decision.reason }], totalCents: 0, netCents: args.grossCents };
}
