/**
 * Commercial Configuration — Tuition Rates V3.
 *
 * Rate model: program_offering_variant × billing_cadence → rate, per org or per site.
 * Org default (location_id = null) is inherited by all sites unless a
 * site-level override exists.
 *
 * V3 model: variant_id (FK to program_offering_variants) replaces offering_id.
 * Rates always attach to variants — never directly to offerings or programs.
 * Commercial owns rates. Programs owns offerings and variants.
 */

export type TuitionBillingPeriod = "monthly" | "weekly" | "biweekly" | "annual";

export type TuitionRateRow = {
    id: string;
    org_id: string;
    location_id: string | null;
    variant_id: string;
    cadence_key: string;
    payer_type: string;
    rate_cents: number;
    is_active: boolean;
    /** Explicitly not offered at this scope/cadence — distinct from "no rate set". */
    not_offered: boolean;
    /** Optional: date from which this rate is effective (ISO date string, YYYY-MM-DD). */
    effective_start: string | null;
    /** Optional: date after which this rate expires (ISO date string, YYYY-MM-DD). */
    effective_end: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

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

/** Build a cell key for indexing the rate grid. V3: variant × cadence. */
export function tuitionRateCellKey(variantId: string, cadenceKey: string): string {
    return `${variantId}::${cadenceKey}`;
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
            map.set(tuitionRateCellKey(r.variant_id, r.cadence_key), r);
        }
    }

    if (locationId) {
        for (const r of rates) {
            if (r.location_id === locationId) {
                map.set(tuitionRateCellKey(r.variant_id, r.cadence_key), r);
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
            map.set(tuitionRateCellKey(r.variant_id, r.cadence_key), r);
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
    const effective = rateRow;
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

/** Readiness: how many variant×cadence cells have rates set at the org level. */
export type TuitionReadiness = {
    total: number;
    configured: number;
    notOffered: number;
    missing: number;
    percentComplete: number;
};

export function computeTuitionReadiness(
    variantIds: string[],
    cadenceKeys: string[],
    rates: TuitionRateRow[],
): TuitionReadiness {
    const orgMap = buildTuitionRateMap(rates, null);
    const total = variantIds.length * cadenceKeys.length;
    let configured = 0;
    let notOffered = 0;

    for (const vid of variantIds) {
        for (const ck of cadenceKeys) {
            const row = orgMap.get(tuitionRateCellKey(vid, ck));
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
