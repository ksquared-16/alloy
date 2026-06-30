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
    /** Explicitly not offered — distinct from "no rate set yet". */
    not_offered: boolean;
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
    if (!cleaned) return null;
    const val = parseFloat(cleaned);
    if (!Number.isFinite(val) || val < 0) return null;
    return Math.round(val * 100);
}

/** Build a cell key for indexing the rate grid. */
export function tuitionRateCellKey(
    programKey: string,
    scheduleKey: string,
    billingPeriod: TuitionBillingPeriod,
): string {
    return `${programKey}::${scheduleKey}::${billingPeriod}`;
}

/**
 * Build a lookup map from cell key to rate row.
 * Org defaults first, then location overrides win.
 */
export function buildTuitionRateMap(
    rates: TuitionRateRow[],
    locationId: string | null,
): Map<string, TuitionRateRow> {
    const map = new Map<string, TuitionRateRow>();

    for (const r of rates) {
        if (r.location_id === null) {
            map.set(tuitionRateCellKey(r.program_key, r.schedule_key, r.billing_period), r);
        }
    }

    if (locationId) {
        for (const r of rates) {
            if (r.location_id === locationId) {
                map.set(tuitionRateCellKey(r.program_key, r.schedule_key, r.billing_period), r);
            }
        }
    }

    return map;
}

/** Build a map for a specific location only (no org fallback). */
export function buildLocationOnlyRateMap(
    rates: TuitionRateRow[],
    locationId: string,
): Map<string, TuitionRateRow> {
    const map = new Map<string, TuitionRateRow>();
    for (const r of rates) {
        if (r.location_id === locationId) {
            map.set(tuitionRateCellKey(r.program_key, r.schedule_key, r.billing_period), r);
        }
    }
    return map;
}

/** Check whether a rate is a location override (vs. inherited org default). */
export function isLocationOverride(rate: TuitionRateRow, locationId: string | null): boolean {
    return locationId !== null && rate.location_id === locationId;
}

/** Describe the cell state for a given resolved rate row. */
export type TuitionCellState =
    | { kind: "rate"; rate_cents: number; isOverride: boolean; isInherited: boolean }
    | { kind: "not_offered"; isOverride: boolean; isInherited: boolean }
    | { kind: "unset" };

export function resolveCellState(
    rateRow: TuitionRateRow | undefined,
    orgDefaultRow: TuitionRateRow | undefined,
    locationId: string | null,
): TuitionCellState {
    const effective = rateRow; // already resolved with inheritance from buildTuitionRateMap
    if (!effective) return { kind: "unset" };

    const isOrgRow = effective.location_id === null;
    const isLocRow = locationId !== null && effective.location_id === locationId;
    const isInherited = isOrgRow && locationId !== null;
    const isOverride = isLocRow;

    if (effective.not_offered) {
        return { kind: "not_offered", isOverride, isInherited };
    }
    return {
        kind: "rate",
        rate_cents: effective.rate_cents,
        isOverride,
        isInherited,
    };
}

/** Readiness: how many cells in the grid have rates set at the org level. */
export type TuitionReadiness = {
    total: number;
    configured: number;
    notOffered: number;
    missing: number;
    percentComplete: number;
};

export function computeTuitionReadiness(
    programKeys: string[],
    scheduleKeys: string[],
    billingPeriod: TuitionBillingPeriod,
    rates: TuitionRateRow[],
): TuitionReadiness {
    const orgMap = buildTuitionRateMap(rates, null);
    const total = programKeys.length * scheduleKeys.length;
    let configured = 0;
    let notOffered = 0;

    for (const pk of programKeys) {
        for (const sk of scheduleKeys) {
            const row = orgMap.get(tuitionRateCellKey(pk, sk, billingPeriod));
            if (!row) continue;
            if (row.not_offered) notOffered++;
            else configured++;
        }
    }

    const missing = total - configured - notOffered;
    return {
        total,
        configured,
        notOffered,
        missing,
        percentComplete: total > 0 ? Math.round(((configured + notOffered) / total) * 100) : 0,
    };
}

/** Diff two rate maps — used for Compare view. */
export type RateDiff =
    | { kind: "same" }
    | { kind: "location_override"; locationRate: TuitionRateRow; orgRate: TuitionRateRow | undefined }
    | { kind: "not_offered_override" }
    | { kind: "org_only"; orgRate: TuitionRateRow }
    | { kind: "unset" };

export function diffRateMaps(
    orgMap: Map<string, TuitionRateRow>,
    locationMap: Map<string, TuitionRateRow>,
    cellKey: string,
): RateDiff {
    const orgRow = orgMap.get(cellKey);
    const locRow = locationMap.get(cellKey);

    if (!orgRow && !locRow) return { kind: "unset" };
    if (!locRow) {
        if (!orgRow) return { kind: "unset" };
        return { kind: "org_only", orgRate: orgRow };
    }
    if (!orgRow) {
        return { kind: "location_override", locationRate: locRow, orgRate: undefined };
    }
    if (locRow.not_offered !== orgRow.not_offered) {
        return { kind: "not_offered_override" };
    }
    if (locRow.rate_cents !== orgRow.rate_cents) {
        return { kind: "location_override", locationRate: locRow, orgRate: orgRow };
    }
    return { kind: "same" };
}
