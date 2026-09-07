/**
 * IS TUITION DUE FOR THIS ASSIGNMENT, IN THIS SERVICE PERIOD, AND AT WHAT PRICE? (pure)
 *
 * ── THE ACCEPTED TERM IS THE MONEY, AND NOTHING ELSE IS ──
 *
 * Generation does not re-resolve the catalog. It cannot: an accepted term may be an OVERRIDE, agreed
 * deliberately at something other than the recommendation, and a generator that priced from today's
 * catalog would quietly bill that family the rate they did not agree to. It would also let a catalog
 * edit change what an already-agreed family owes next month, which is the drift
 * `enrollment_pricing_terms` exists to prevent.
 *
 * So the amount, the currency and the cadence all come from the term, and this function's only
 * pricing job is choosing WHICH term — never what it costs.
 *
 * ── WHAT IT REFUSES, AND WHY REFUSING IS THE ANSWER ──
 *
 * TWO TERMS COVERING ONE PERIOD is a configuration the platform cannot bill without inventing a
 * rule. Picking one would double-bill or under-bill silently depending on which; both are worse than
 * saying so. `enrollment_pricing_terms` allows at most one LIVE term per assignment per effective
 * date, but two terms with different effective dates can still both span a month, and that is the
 * case this refuses.
 *
 * A PARTIAL PERIOD WITH NO PRORATION POLICY is the other. A term that starts or ends mid-month
 * covers part of it, and what part of a month costs is a policy decision — `financial_policies`
 * carries `proration` with methods none/daily/calendar_day/business_day, and an organisation that
 * has not configured one has not decided. Billing a whole month for a fortnight is not a default; it
 * is a guess with somebody's money. So this refuses and names the policy it needs.
 *
 * ── WHAT IT IS NOT ──
 *
 * It creates nothing, reads nothing, and knows nothing about consumption events, obligations or
 * charges. It answers one question so the service around it can stay about persistence.
 */

import { billingPeriodFromKey, type BillingPeriod } from "@/lib/financials/billingPeriod";
import type { AcceptedPricingTerm } from "@/lib/enrollment/pricing/enrollmentPricingTermsService";

/** How a partial period is priced, from `financial_policies` — `none` means "not decided". */
export type ProrationMethod = "none" | "daily" | "calendar_day" | "business_day";

export type TuitionRecurrenceInput = {
    /** The accepted terms for ONE assignment. Superseded terms are excluded by the reader. */
    terms: readonly AcceptedPricingTerm[];
    /** The service period being billed, as a billing-period key (`YYYY-MM`). */
    periodKey: string;
    /** The organisation's configured proration method, when it has configured one. */
    prorationMethod?: ProrationMethod | null;
    /** The cadence this run bills. A term on another cadence is not this run's business. */
    cadenceKey?: string;
};

export type TuitionRecurrenceDecision =
    | {
          kind: "due";
          term: AcceptedPricingTerm;
          period: BillingPeriod;
          /** The whole-period amount from the term. Proration, when it applies, is applied below. */
          amountCents: number;
          currencyCode: string;
          /** The days of the period the term actually covers, and the days in it. */
          coverage: { coveredDays: number; periodDays: number; partial: boolean };
          /** The service date the occurrence is anchored to — the first covered day. */
          serviceDate: string;
          prorationMethod: ProrationMethod;
      }
    | { kind: "not_due"; reason: NotDueReason; period: BillingPeriod }
    | { kind: "refused"; reason: RefusalReason; detail: string; period: BillingPeriod };

export type NotDueReason =
    | "no_accepted_term"
    | "term_not_yet_effective"
    | "term_already_ended"
    | "cadence_not_billed_by_this_run";

export type RefusalReason = "overlapping_terms" | "proration_policy_required";

function daysBetween(startYmd: string, endYmd: string): number {
    const a = Date.parse(`${startYmd}T00:00:00Z`);
    const b = Date.parse(`${endYmd}T00:00:00Z`);
    return Math.round((b - a) / 86_400_000) + 1;
}

function laterOf(a: string, b: string): string {
    return a > b ? a : b;
}

function earlierOf(a: string, b: string): string {
    return a < b ? a : b;
}

/**
 * Decide what this assignment owes for one service period.
 *
 * Pure and total: every input produces a decision, and none of them is an exception.
 */
export function resolveTuitionRecurrence(input: TuitionRecurrenceInput): TuitionRecurrenceDecision {
    const period = billingPeriodFromKey(input.periodKey);
    const cadence = (input.cadenceKey ?? "monthly").trim();
    const method: ProrationMethod = (input.prorationMethod ?? "none") as ProrationMethod;

    // Only tuition terms on the cadence this run bills.
    const onCadence = input.terms.filter((t) => t.termKind === "tuition" && t.cadenceKey === cadence);
    if (input.terms.length > 0 && onCadence.length === 0) {
        return { kind: "not_due", reason: "cadence_not_billed_by_this_run", period };
    }
    if (onCadence.length === 0) {
        return { kind: "not_due", reason: "no_accepted_term", period };
    }

    // A term covers the period when its effective window overlaps it at all.
    const covering = onCadence.filter(
        (t) => t.effectiveStart <= period.end && (t.effectiveEnd == null || t.effectiveEnd >= period.start),
    );
    if (covering.length === 0) {
        // Told apart, because "not yet" and "no longer" are different things to an operator.
        const anyFuture = onCadence.some((t) => t.effectiveStart > period.end);
        const anyEnded = onCadence.some((t) => t.effectiveEnd != null && t.effectiveEnd < period.start);
        return {
            kind: "not_due",
            reason: anyFuture && !anyEnded ? "term_not_yet_effective" : anyEnded ? "term_already_ended" : "no_accepted_term",
            period,
        };
    }
    if (covering.length > 1) {
        return {
            kind: "refused",
            reason: "overlapping_terms",
            detail:
                `${covering.length} accepted terms cover ${period.key} `
                + `(${covering.map((t) => `${t.termId}@${t.effectiveStart}`).join(", ")}). `
                + "Supersede one of them before billing this period.",
            period,
        };
    }

    const term = covering[0]!;
    const coverStart = laterOf(term.effectiveStart, period.start);
    const coverEnd = term.effectiveEnd == null ? period.end : earlierOf(term.effectiveEnd, period.end);
    const periodDays = daysBetween(period.start, period.end);
    const coveredDays = daysBetween(coverStart, coverEnd);
    const partial = coveredDays < periodDays;

    if (partial && method === "none") {
        return {
            kind: "refused",
            reason: "proration_policy_required",
            detail:
                `The term covers ${coveredDays} of ${periodDays} days in ${period.key}, and no proration `
                + "policy is configured. Configure a proration policy, or bill this period manually — a "
                + "part period is not silently a whole one.",
            period,
        };
    }

    return {
        kind: "due",
        term,
        period,
        // The TERM's amount, untouched. Proration is applied by the caller through the configured
        // method: this function reports the coverage rather than inventing a formula for it.
        amountCents: term.amountCents,
        currencyCode: term.currencyCode,
        coverage: { coveredDays, periodDays, partial },
        serviceDate: coverStart,
        prorationMethod: method,
    };
}

/**
 * THE OCCURRENCE'S NAME.
 *
 * One tuition occurrence per accepted term per service period, and the name says exactly that. It is
 * what the database's unique index on `consumption_events (org_id, idempotency_key)` converges on,
 * so a retry, an overlapping window and two concurrent identical runs all land on the same row
 * without any of them having to check first.
 *
 * The TERM is in the key, not just the assignment: a superseded term and its successor are different
 * agreements, and a period billed under one is not the period billed under the other.
 */
export function tuitionOccurrenceKey(termId: string, periodKey: string): string {
    return `cev:tuition:${termId}:${periodKey}`;
}
