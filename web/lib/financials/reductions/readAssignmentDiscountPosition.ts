import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAssignmentTuitionView } from "@/lib/enrollment/pricing/buildAssignmentTuitionView";
import { acceptedTermBillingPeriods } from "@/lib/financials/billingPeriod";
import { forecastAssignmentReductions } from "@/lib/financials/reductions/forecastAssignmentReductions";
import {
    exceptionAppliesOn,
    exceptionIsLiveOn,
    readExceptionHistory,
} from "@/lib/financials/reductions/commercialPolicyExceptionService";
import { readPolicies } from "@/lib/commercial/execution/export/readCommercialConfig";

/**
 * WHAT DISCOUNTS ARE EXPECTED TO APPLY TO ONE COMMERCIAL RELATIONSHIP.
 *
 * This is the body the per-assignment forecast route has always run, lifted out unchanged so that
 * a FAMILY-grain reader can ask the same question of each of a household's relationships without a
 * second implementation of it existing anywhere.
 *
 * ── WHY LIFTING IT MATTERS MORE THAN IT LOOKS ─────────────────────────────────────────────────
 *
 * The family surface needs per-child expected effects. The obvious way to get them is to add up
 * policy rates in the card, and that would be a second eligibility engine: it would not know about
 * exceptions, effective windows, category scoping, or the monthly resolution doctrine below, and it
 * would drift from the applied truth the moment any of those changed. There is one forecast
 * authority — `forecastAssignmentReductions` — and this is the one call into it.
 *
 * READ ONLY. Nothing here writes a reduction, charge, adjustment or ledger row.
 */

export type AssignmentDiscountPosition = {
    opportunityCustomerMemberId: string;
    /** Null when there is no assignment, or no accepted term to forecast against. */
    forecast: Awaited<ReturnType<typeof forecastAssignmentReductions>> | null;
    reason: "no_assignment" | "no_accepted_term" | "no_household" | null;
    customerId: string | null;
    customerMemberId: string | null;
    /** The gross the forecast reasoned from — the ACCEPTED term, never the recommendation. */
    acceptedAmountCents: number | null;
    currencyCode: string | null;
    exceptions: {
        id: string;
        policyId: string;
        policyLabel: string;
        effectiveStart: string | null;
        effectiveEnd: string | null;
        reason: string | null;
        appliesNow: boolean;
        isLiveNow: boolean;
        ended: boolean;
        superseded: boolean;
    }[];
};

export async function readAssignmentDiscountPosition(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityCustomerMemberId: string },
): Promise<AssignmentDiscountPosition> {
    const ocmId = args.opportunityCustomerMemberId;
    const empty = (reason: AssignmentDiscountPosition["reason"]): AssignmentDiscountPosition => ({
        opportunityCustomerMemberId: ocmId,
        forecast: null,
        reason,
        customerId: null,
        customerMemberId: null,
        acceptedAmountCents: null,
        currencyCode: null,
        exceptions: [],
    });

    const view = await buildAssignmentTuitionView(supabase, {
        orgId: args.orgId,
        opportunityCustomerMemberId: ocmId,
    });
    if (!view) return empty("no_assignment");
    const accepted = view.accepted;
    if (!accepted) return empty("no_accepted_term");

    /* The household the agreement belongs to — the facts are a household's, not a child's. */
    const { data: agreement } = await supabase
        .from("child_enrollment_agreements")
        .select("id, customer_id, customer_member_id")
        .eq("org_id", args.orgId)
        .eq("id", accepted.enrollmentAgreementId ?? "")
        .maybeSingle();
    const row = agreement as { id: string; customer_id: string | null; customer_member_id: string | null } | null;
    if (!row?.customer_id) return empty("no_household");

    /*
     * ── THE REDUCTION PERIOD IS MONTHLY, EVEN WHEN THE COMMERCIAL ONE IS NOT ──────────────────
     *
     * Reductions resolve per calendar month, by the same doctrine that keeps `placeInBillingPeriod`
     * monthly by default. A weekly assignment's current commercial period is `2026-09-15~2026-09-21`,
     * which is not that shape. So the forecast asks about the MONTH the current commercial period
     * starts in — the month the application path will resolve the same charge under, which is the
     * only reason the two can be expected to agree.
     */
    const periods = acceptedTermBillingPeriods(
        {
            cadenceKey: accepted.cadenceKey,
            effectiveStart: accepted.effectiveStart,
            effectiveEnd: accepted.effectiveEnd,
        },
        new Date().toISOString().slice(0, 10),
    );
    const periodKey = (periods?.current.start ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
    const periodStartForExceptions = periods?.current.start ?? `${periodKey}-01`;

    const forecast = await forecastAssignmentReductions(supabase, {
        orgId: args.orgId,
        opportunityCustomerMemberId: ocmId,
        customerId: row.customer_id,
        customerMemberId: accepted.customerMemberId,
        enrollmentAgreementId: row.id,
        grossCents: accepted.amountCents,
        currencyCode: accepted.currencyCode,
        periodKey,
        categoryKey: "tuition",
    });

    /*
     * WHAT THIS RELATIONSHIP IS EXCEPTED FROM — beside the forecast, never folded into it. The
     * forecast answers "what would happen"; this answers "what did somebody decide, and why", and
     * an operator looking at a discount that is not applying needs the second to make sense of the
     * first.
     */
    const history = await readExceptionHistory(supabase, {
        orgId: args.orgId,
        opportunityCustomerMemberId: ocmId,
    }).catch(() => []);
    const policyLabels = new Map(
        (await readPolicies({ supabase, orgId: args.orgId } as never).catch(() => [])).map(
            /* Same precedence as the forecast: configured name, then authored value, then kind. */
            (p) => [p.id, p.label ?? (p.params?.label as string | undefined) ?? p.kind] as const,
        ),
    );
    const todayYmd = new Date().toISOString().slice(0, 10);
    const exceptions = history.map((e) => ({
        id: e.id,
        policyId: e.policyId,
        policyLabel: policyLabels.get(e.policyId) ?? "Discount policy",
        effectiveStart: e.effectiveStart,
        effectiveEnd: e.effectiveEnd,
        reason: e.reason,
        /*
         * TWO QUESTIONS, TWO ANSWERS. `appliesNow` is about the PERIOD the forecast used;
         * `isLiveNow` is about TODAY. An exception ended today whose window began on the 1st
         * answers true to the first and false to the second, and a surface that offers "End
         * exception" off the first offers to end something already ended.
         */
        appliesNow: exceptionAppliesOn(e, periodStartForExceptions),
        isLiveNow: exceptionIsLiveOn(e, todayYmd),
        ended: Boolean(e.effectiveEnd && e.effectiveEnd < todayYmd),
        superseded: Boolean(e.supersededAt),
    }));

    return {
        opportunityCustomerMemberId: ocmId,
        forecast,
        reason: null,
        customerId: row.customer_id,
        customerMemberId: accepted.customerMemberId,
        acceptedAmountCents: accepted.amountCents,
        currencyCode: accepted.currencyCode,
        exceptions,
    };
}
