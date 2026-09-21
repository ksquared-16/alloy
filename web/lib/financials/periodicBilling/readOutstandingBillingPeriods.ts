/**
 * WHAT IS ACTUALLY OUTSTANDING — the truth the catch-up bound is measured against.
 *
 * ── WHY THIS IS A READ, AND WHY IT ENUMERATES EVERYTHING ──────────────────────────────────────
 *
 * The bound is "at most two canonical Billing Periods may be mutated automatically". That is an
 * authority limit, NOT a lookback limit. A reader that inspected only the two most recent periods
 * would answer "two outstanding" for an assignment with seven, and the handler would then bill two
 * of seven and call it a normal catch-up — which is precisely the rolling drain the doctrine
 * forbids. So this walks every canonical period from the assignment's own anchor to today and
 * returns the COMPLETE outstanding set. The handler decides what it may do with it.
 *
 * ── NOTHING HERE DECIDES WHETHER A PERIOD IS DUE ──────────────────────────────────────────────
 *
 * `resolveTuitionRecurrence` is the authority for due / not-due / refused, and it is called here
 * exactly as generation calls it, with the same terms, the same period and the same proration
 * method. A second due-ness rule living in a scheduled reader is how automatic billing and manual
 * billing start disagreeing about what is owed.
 *
 * ── CONVERGED MEANS A TUITION CHARGE ALREADY EXISTS FOR THE PERIOD ────────────────────────────
 *
 * Generation converges on `(assignment, period)`: a second run over a period that already has a
 * charge reports `unchanged` rather than creating another. So "unconverged" is read the same way —
 * no tuition charge on that agreement for that period's service date. DRAFT COUNTS AS CONVERGED:
 * a draft is work generation already did, and treating it as outstanding would make the backlog
 * look permanently unbilled and would eventually push a healthy assignment over the bound.
 *
 * The whole org's tuition charges are read in ONE query and indexed, rather than a query per
 * period, because an assignment with a year of weekly periods would otherwise issue fifty round
 * trips to answer one question.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { readAcceptedPricingTerms, type AcceptedPricingTerm } from "@/lib/enrollment/pricing/enrollmentPricingTermsService";
import { listFinancialPolicies } from "@/lib/financials/policies/financialPolicyService";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
import {
    billingPeriodsBetween,
    isPeriodBillableCadence,
    type BillingCadence,
    type BillingPeriod,
} from "@/lib/financials/billingPeriod";
import {
    resolveTuitionRecurrence,
    type NotDueReason,
    type ProrationMethod,
    type RefusalReason,
} from "@/lib/financials/tuitionGeneration/resolveTuitionRecurrence";

export type OutstandingPeriod = {
    periodKey: string;
    periodLabel: string;
    start: string;
    end: string;
    amountCents: number;
    currencyCode: string;
};

export type OutstandingAssignment = {
    opportunityCustomerMemberId: string;
    cadenceKey: string;
    /** The agreement anchor these periods are tiled from — the family's, not the calendar's. */
    anchorYmd: string;
    /** EVERY due, unconverged canonical period, oldest first. Never truncated to the bound. */
    outstanding: OutstandingPeriod[];
    /** Periods that are due and already have a tuition charge. */
    convergedCount: number;
    /** Configuration problems the period walk surfaced, by reason. */
    refusals: { periodKey: string; reason: RefusalReason; detail: string }[];
    notDue: { periodKey: string; reason: NotDueReason }[];
};

export type OutstandingBillingPeriodsResult = {
    orgId: string;
    todayYmd: string;
    assignments: OutstandingAssignment[];
};

/** A tuition charge on this agreement for this service date — draft or posted. */
function chargeIndexKey(agreementId: string, serviceDate: string): string {
    return `${agreementId}::${serviceDate}`;
}

export async function readOutstandingBillingPeriods(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        todayYmd: string;
        /** Optional bounded scope. Absent, every assignment with an accepted term is considered. */
        opportunityCustomerMemberIds?: readonly string[] | null;
    },
): Promise<OutstandingBillingPeriodsResult> {
    const { orgId, todayYmd } = args;

    const allTerms = await readAcceptedPricingTerms(supabase, { orgId });
    const scope = args.opportunityCustomerMemberIds?.length
        ? new Set(args.opportunityCustomerMemberIds)
        : null;
    const terms = scope ? allTerms.filter((t) => scope.has(t.opportunityCustomerMemberId)) : allTerms;

    const byAssignment = new Map<string, AcceptedPricingTerm[]>();
    for (const t of terms) {
        const list = byAssignment.get(t.opportunityCustomerMemberId) ?? [];
        list.push(t);
        byAssignment.set(t.opportunityCustomerMemberId, list);
    }

    /* The same proration authority generation resolves, resolved once. */
    const policies = await listFinancialPolicies(supabase, orgId);
    const prorationPolicy = resolveFinancialPolicy(policies, "proration", {}, todayYmd);
    const prorationMethod = (prorationPolicy.resolved
        ? ((prorationPolicy.policy.value as { method?: string }).method ?? "none")
        : "none") as ProrationMethod;

    /* Every tuition charge in the org, once. */
    const agreementIds = [...new Set(terms.map((t) => t.enrollmentAgreementId).filter((v): v is string => Boolean(v)))];
    const charged = new Set<string>();
    if (agreementIds.length > 0) {
        const { data } = await supabase
            .from("charges")
            .select("billable_source_id, service_date")
            .eq("org_id", orgId)
            .eq("billable_source_type", "enrollment_agreement")
            .eq("charge_category", "tuition")
            .in("billable_source_id", agreementIds);
        for (const row of ((data ?? []) as Array<{ billable_source_id: string; service_date: string }>)) {
            charged.add(chargeIndexKey(row.billable_source_id, row.service_date));
        }
    }

    const assignments: OutstandingAssignment[] = [];

    for (const [opportunityCustomerMemberId, assignmentTerms] of byAssignment) {
        const tuitionTerms = assignmentTerms.filter((t) => t.termKind === "tuition");
        if (tuitionTerms.length === 0) continue;

        /*
         * ONE ASSIGNMENT, ONE COMMERCIAL CADENCE. Where an assignment's terms disagree the
         * outstanding set cannot be stated without choosing between them, and choosing silently is
         * how a weekly family gets billed monthly. The disagreement is reported as a refusal for
         * the operator instead.
         */
        const cadences = [...new Set(tuitionTerms.map((t) => t.cadenceKey.trim()))];
        const cadenceKey = cadences[0] ?? "";
        const anchorYmd = tuitionTerms
            .map((t) => t.effectiveStart)
            .filter((d): d is string => typeof d === "string" && d.length === 10)
            .sort()[0] ?? todayYmd;

        if (cadences.length > 1) {
            assignments.push({
                opportunityCustomerMemberId,
                cadenceKey: cadences.join("+"),
                anchorYmd,
                outstanding: [],
                convergedCount: 0,
                refusals: [{
                    periodKey: "",
                    reason: "overlapping_terms",
                    detail: `This assignment holds tuition terms on more than one billing frequency (${cadences.join(", ")}), so its canonical periods cannot be enumerated.`,
                }],
                notDue: [],
            });
            continue;
        }

        if (!isPeriodBillableCadence(cadenceKey)) {
            /* Usage-priced cadences have no interval, so they have no outstanding periods. */
            assignments.push({
                opportunityCustomerMemberId, cadenceKey, anchorYmd,
                outstanding: [], convergedCount: 0, refusals: [],
                notDue: [{ periodKey: "", reason: "cadence_not_billed_by_this_run" }],
            });
            continue;
        }
        const cadence: BillingCadence = cadenceKey;

        /*
         * FROM THE ANCHOR TO TODAY. A period whose start is still in the future is not yet due, so
         * the walk ends at today; every earlier period is a candidate and its due-ness is the
         * domain authority's answer, not this walk's.
         */
        const periods: BillingPeriod[] = billingPeriodsBetween(cadence, anchorYmd, anchorYmd, todayYmd);

        const outstanding: OutstandingPeriod[] = [];
        const refusals: OutstandingAssignment["refusals"] = [];
        const notDue: OutstandingAssignment["notDue"] = [];
        let convergedCount = 0;

        for (const period of periods) {
            if (period.start > todayYmd) continue;
            const decision = resolveTuitionRecurrence({
                terms: tuitionTerms,
                period,
                prorationMethod,
                cadenceKey,
            });
            if (decision.kind === "not_due") {
                notDue.push({ periodKey: period.key, reason: decision.reason });
                continue;
            }
            if (decision.kind === "refused") {
                refusals.push({ periodKey: period.key, reason: decision.reason, detail: decision.detail });
                continue;
            }
            const agreementId = decision.term.enrollmentAgreementId;
            if (!agreementId) {
                /* Priced but not enrolled — generation says this too, and says it the same way. */
                notDue.push({ periodKey: period.key, reason: "no_accepted_term" });
                continue;
            }
            if (charged.has(chargeIndexKey(agreementId, decision.serviceDate))) {
                convergedCount += 1;
                continue;
            }
            outstanding.push({
                periodKey: period.key,
                periodLabel: period.label,
                start: period.start,
                end: period.end,
                amountCents: decision.amountCents,
                currencyCode: decision.currencyCode,
            });
        }

        assignments.push({
            opportunityCustomerMemberId,
            cadenceKey,
            anchorYmd,
            outstanding: outstanding.sort((a, b) => a.start.localeCompare(b.start)),
            convergedCount,
            refusals,
            notDue,
        });
    }

    return { orgId, todayYmd, assignments };
}
