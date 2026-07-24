/**
 * Shared location applicability helpers for Catalog / Policies / Tuition.
 * Persisted in entity metadata — no schema redesign.
 */

export const SELECTED_LOCATION_IDS_META_KEY = "selected_location_ids";
export const LOCATION_PRICES_META_KEY = "location_prices";
export const TUITION_LOCATION_IDS_META_KEY = "tuition_location_ids";
export const POLICY_LOCATION_IDS_META_KEY = "location_ids";

export type LocationPriceOverride = {
    amount_cents: number;
    effective_start?: string | null;
};

export type LocationApplicability = {
    mode: "all" | "selected";
    locationIds: string[];
};

export function readLocationIdsFromMetadata(
    metadata: Record<string, unknown> | null | undefined,
    key: string = SELECTED_LOCATION_IDS_META_KEY,
): string[] | null {
    if (!metadata) return null;
    const raw = metadata[key];
    if (raw == null) return null;
    if (!Array.isArray(raw)) return null;
    const ids = raw
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);
    return ids;
}

export function locationApplicabilityFromMetadata(
    metadata: Record<string, unknown> | null | undefined,
    key: string = SELECTED_LOCATION_IDS_META_KEY,
    /** Legacy single location_id column when present. */
    legacyLocationId?: string | null,
): LocationApplicability {
    const ids = readLocationIdsFromMetadata(metadata, key);
    if (ids != null) {
        return ids.length === 0 ? { mode: "all", locationIds: [] } : { mode: "selected", locationIds: ids };
    }
    if (legacyLocationId) {
        return { mode: "selected", locationIds: [legacyLocationId] };
    }
    return { mode: "all", locationIds: [] };
}

export function writeLocationIdsMetadata(
    metadata: Record<string, unknown> | null | undefined,
    applicability: LocationApplicability,
    key: string = SELECTED_LOCATION_IDS_META_KEY,
): Record<string, unknown> {
    const next = { ...(metadata ?? {}) };
    if (applicability.mode === "all") {
        delete next[key];
    } else {
        next[key] = [...new Set(applicability.locationIds)];
    }
    return next;
}

export function readLocationPrices(
    metadata: Record<string, unknown> | null | undefined,
): Record<string, LocationPriceOverride> {
    if (!metadata) return {};
    const raw = metadata[LOCATION_PRICES_META_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, LocationPriceOverride> = {};
    for (const [locationId, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const row = value as Record<string, unknown>;
        const amount = Number(row.amount_cents);
        if (!Number.isFinite(amount) || amount < 0) continue;
        out[locationId] = {
            amount_cents: Math.round(amount),
            effective_start: typeof row.effective_start === "string" ? row.effective_start : null,
        };
    }
    return out;
}

export function writeLocationPricesMetadata(
    metadata: Record<string, unknown> | null | undefined,
    prices: Record<string, LocationPriceOverride>,
): Record<string, unknown> {
    const next = { ...(metadata ?? {}) };
    const cleaned: Record<string, LocationPriceOverride> = {};
    for (const [locationId, row] of Object.entries(prices)) {
        if (!locationId.trim()) continue;
        cleaned[locationId] = {
            amount_cents: Math.round(row.amount_cents),
            effective_start: row.effective_start ?? null,
        };
    }
    if (Object.keys(cleaned).length === 0) {
        delete next[LOCATION_PRICES_META_KEY];
    } else {
        next[LOCATION_PRICES_META_KEY] = cleaned;
    }
    return next;
}

export function resolveLocationPriceCents(input: {
    organizationAmountCents: number;
    locationId: string;
    locationPrices: Record<string, LocationPriceOverride>;
}): { amountCents: number; source: "organization" | "location" } {
    const override = input.locationPrices[input.locationId];
    if (override) {
        return { amountCents: override.amount_cents, source: "location" };
    }
    return { amountCents: input.organizationAmountCents, source: "organization" };
}
