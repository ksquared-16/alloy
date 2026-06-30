/**
 * Commercial Configuration — Tuition rates.
 *
 * Rate grid: program × schedule → rate, per org or per site.
 * Org default (location_id = null) is inherited by all sites
 * unless a site-level override exists.
 */

export type TuitionRateRow = {
    id: string;
    org_id: string;
    location_id: string | null;
    program_key: string;
    schedule_key: string;
    rate_cents: number;
    billing_period: TuitionBillingPeriod;
    is_active: boolean;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

export type TuitionBillingPeriod = "weekly" | "biweekly" | "monthly" | "annual";

export const TUITION_BILLING_PERIODS: { key: TuitionBillingPeriod; label: string }[] = [
    { key: "weekly", label: "Weekly" },
    { key: "biweekly", label: "Bi-weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "annual", label: "Annual" },
];

export const DEFAULT_BILLING_PERIOD: TuitionBillingPeriod = "monthly";

/** Format cents as a dollar string. */
export function formatRateCents(cents: number): string {
    const dollars = cents / 100;
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(dollars);
}

/** Parse a dollar string to cents. Returns null if not parseable. */
export function parseDollarsToCents(raw: string): number | null {
    const cleaned = raw.replace(/[$,\s]/g, "");
    const val = parseFloat(cleaned);
    if (!Number.isFinite(val) || val < 0) return null;
    return Math.round(val * 100);
}

/** Build a cell key for indexing the rate grid. */
export function tuitionRateCellKey(programKey: string, scheduleKey: string, billingPeriod: TuitionBillingPeriod): string {
    return `${programKey}::${scheduleKey}::${billingPeriod}`;
}

/**
 * Build a lookup map from cell key to rate row.
 * If includeOrgDefault is true, org defaults are included for cells without location overrides.
 */
export function buildTuitionRateMap(
    rates: TuitionRateRow[],
    locationId: string | null,
): Map<string, TuitionRateRow> {
    const map = new Map<string, TuitionRateRow>();

    // First pass: org defaults
    for (const r of rates) {
        if (r.location_id === null) {
            map.set(tuitionRateCellKey(r.program_key, r.schedule_key, r.billing_period), r);
        }
    }

    // Second pass: location overrides win
    if (locationId) {
        for (const r of rates) {
            if (r.location_id === locationId) {
                map.set(tuitionRateCellKey(r.program_key, r.schedule_key, r.billing_period), r);
            }
        }
    }

    return map;
}

/** Check whether a rate is a location override (vs. inherited org default). */
export function isLocationOverride(rate: TuitionRateRow, locationId: string | null): boolean {
    return locationId !== null && rate.location_id === locationId;
}
