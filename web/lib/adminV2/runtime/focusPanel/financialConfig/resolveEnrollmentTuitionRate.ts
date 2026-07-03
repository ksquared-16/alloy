/**
 * Financial Configuration V1 — tuition rate resolution.
 *
 * Pure function: given a list of tuition rate rows (from commercial_tuition_rates)
 * and a child's program + schedule keys, find the best-matching rate.
 *
 * Resolution rules:
 *   1. Only active, not-offered=false rows are eligible.
 *   2. Location-specific rows beat org defaults (location_id = null).
 *   3. When tier is tied, prefer billing periods in this order:
 *      monthly → weekly → biweekly → annual.
 *   4. Returns null when no row matches — never fabricates a rate.
 *   5. Returns null when programKey or scheduleKey is absent.
 *
 * These rules are deterministic: the same inputs always produce the same output.
 * The rate pool is fetched once per API request and shared across all children.
 */

import type { TuitionBillingPeriod } from "@/lib/commercial/tuitionRates";

export type TuitionRateCandidate = {
    id: string;
    program_key: string;
    schedule_key: string;
    rate_cents: number;
    billing_period: TuitionBillingPeriod;
    /** null = org-wide default; non-null = location-specific override. */
    location_id: string | null;
};

export type ResolvedTuitionRate = {
    rateId: string;
    rateCents: number;
    billingPeriod: TuitionBillingPeriod;
    /** Pre-formatted for display: "$1,200/month". Formatted by caller. */
    rateLabel: string;
    /** True when a location-specific row won over the org default. */
    isLocationOverride: boolean;
};

/** Documented period preference — index = priority (lower = preferred). */
export const TUITION_PERIOD_PREFERENCE: TuitionBillingPeriod[] = [
    "monthly",
    "weekly",
    "biweekly",
    "annual",
];

/**
 * Resolve the best-matching tuition rate for a given program + schedule.
 *
 * @param rates     Active, non-not-offered rows from commercial_tuition_rates.
 * @param programKey  Child's stable program key — derived from the OCM program_category_id FK (location_program_categories.key).
 * @param scheduleKey Child's schedule_type.
 * @param locationId  Child's enrolled location_id (for override priority), or null.
 * @param formatLabel Called to produce the rateLabel string. Injected so this function
 *                    has no I/O dependency and is pure.
 * @returns Resolved rate, or null when no match exists or keys are absent.
 */
export function resolveEnrollmentTuitionRate(
    rates: TuitionRateCandidate[],
    programKey: string | null,
    scheduleKey: string | null,
    locationId: string | null,
    formatLabel: (rateCents: number, billingPeriod: TuitionBillingPeriod) => string,
): ResolvedTuitionRate | null {
    // Rule 5: missing placement → no rate
    if (!programKey || !scheduleKey) return null;

    const candidates = rates.filter(
        (r) => r.program_key === programKey && r.schedule_key === scheduleKey,
    );
    // Rule 4: no match → null
    if (candidates.length === 0) return null;

    // Sort: location-specific > org default (Rule 2); then by period (Rule 3).
    const sorted = [...candidates].sort((a, b) => {
        const aIsLoc = locationId !== null && a.location_id === locationId ? 0 : 1;
        const bIsLoc = locationId !== null && b.location_id === locationId ? 0 : 1;
        if (aIsLoc !== bIsLoc) return aIsLoc - bIsLoc;
        const ai = TUITION_PERIOD_PREFERENCE.indexOf(a.billing_period);
        const bi = TUITION_PERIOD_PREFERENCE.indexOf(b.billing_period);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    const best = sorted[0];
    if (!best) return null;

    return {
        rateId: best.id,
        rateCents: best.rate_cents,
        billingPeriod: best.billing_period,
        rateLabel: formatLabel(best.rate_cents, best.billing_period),
        isLocationOverride: locationId !== null && best.location_id === locationId,
    };
}
