/**
 * Commercial Configuration — Tuition rates V2.
 *
 * Rate grid: program_offering × billing_cadence → rate, per org or per site.
 * Org default (location_id = null) is inherited by all sites unless a
 * site-level override exists.
 *
 * V2 model: offering_id (FK to program_offerings) + cadence_key
 * (item_key from commercial_billing_cadence option set) replace the V1
 * program_key / schedule_key / billing_period flat columns.
 */

export type TuitionRateRow = {
    id: string;
    org_id: string;
    location_id: string | null;
    offering_id: string;
    cadence_key: string;
    payer_type: string;
    rate_cents: number;
    is_active: boolean;
    /** Explicitly not offered — distinct from "no rate set yet". */
    not_offered: boolean;
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

/** Build a cell key for indexing the rate grid. */
export function tuitionRateCellKey(offeringId: string, cadenceKey: string): string {
    return `${offeringId}::${cadenceKey}`;
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
            map.set(tuitionRateCellKey(r.offering_id, r.cadence_key), r);
        }
    }

    if (locationId) {
        for (const r of rates) {
            if (r.location_id === locationId) {
                map.set(tuitionRateCellKey(r.offering_id, r.cadence_key), r);
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
            map.set(tuitionRateCellKey(r.offering_id, r.cadence_key), r);
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

/** Readiness: how many cells in the grid have rates set at the org level. */
export type TuitionReadiness = {
    total: number;
    configured: number;
    notOffered: number;
    missing: number;
    percentComplete: number;
};

export function computeTuitionReadiness(
    offeringIds: string[],
    cadenceKeys: string[],
    rates: TuitionRateRow[],
): TuitionReadiness {
    const orgMap = buildTuitionRateMap(rates, null);
    const total = offeringIds.length * cadenceKeys.length;
    let configured = 0;
    let notOffered = 0;

    for (const oid of offeringIds) {
        for (const ck of cadenceKeys) {
            const row = orgMap.get(tuitionRateCellKey(oid, ck));
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
