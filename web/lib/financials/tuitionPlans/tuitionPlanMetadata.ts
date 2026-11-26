/**
 * Compatibility metadata keys for Tuition Plan product presentation.
 * Stored on program_offerings.metadata / commercial_tuition_rates.metadata.
 */

import type { TuitionRateRow } from "@/lib/commercial/tuitionRates";
import {
    locationApplicabilityFromMetadata,
    TUITION_LOCATION_IDS_META_KEY,
    type LocationApplicability,
} from "@/lib/financials/applicability/locationApplicability";

export const TUITION_BILLING_FREQUENCY_META_KEY = "tuition_billing_frequency_key";
export const TUITION_REVENUE_CATEGORY_META_KEY = "tuition_revenue_category_id";
export const TUITION_PRICE_HISTORY_META_KEY = "priceHistory";

export { TUITION_LOCATION_IDS_META_KEY };

/** Reads the Tuition Plan's location applicability (all vs. selected) from offering metadata. */
export function readTuitionLocationApplicability(
    metadata: Record<string, unknown> | null | undefined,
): LocationApplicability {
    return locationApplicabilityFromMetadata(metadata, TUITION_LOCATION_IDS_META_KEY);
}

export type TuitionPriceHistoryEntry = {
    rate_cents: number;
    effective_start: string | null;
    effective_end: string | null;
    recorded_at: string;
};

export function todayIso(now = new Date()): string {
    return now.toISOString().slice(0, 10);
}

export function parseMetaString(metadata: Record<string, unknown>, key: string): string | null {
    const value = metadata[key];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
}

export function readPriceHistory(rate: TuitionRateRow): TuitionPriceHistoryEntry[] {
    const raw = rate.metadata[TUITION_PRICE_HISTORY_META_KEY];
    if (!Array.isArray(raw)) return [];
    return raw
        .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const row = entry as Record<string, unknown>;
            const rate_cents = Number(row.rate_cents);
            if (!Number.isFinite(rate_cents)) return null;
            return {
                rate_cents,
                effective_start: typeof row.effective_start === "string" ? row.effective_start : null,
                effective_end: typeof row.effective_end === "string" ? row.effective_end : null,
                recorded_at: typeof row.recorded_at === "string" ? row.recorded_at : todayIso(),
            } satisfies TuitionPriceHistoryEntry;
        })
        .filter((entry): entry is TuitionPriceHistoryEntry => entry != null);
}

export function appendPriceHistory(
    rate: TuitionRateRow,
    next: Omit<TuitionPriceHistoryEntry, "recorded_at"> & { recorded_at?: string },
): Record<string, unknown> {
    const history = readPriceHistory(rate);
    history.unshift({
        rate_cents: next.rate_cents,
        effective_start: next.effective_start,
        effective_end: next.effective_end,
        recorded_at: next.recorded_at ?? new Date().toISOString(),
    });
    return {
        ...rate.metadata,
        [TUITION_PRICE_HISTORY_META_KEY]: history.slice(0, 40),
    };
}

export function formatTuitionDateLabel(iso: string | null): string {
    if (!iso) return "—";
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function isRateCurrent(rate: TuitionRateRow, asOf: string): boolean {
    if (rate.effective_start && rate.effective_start > asOf) return false;
    if (rate.effective_end && rate.effective_end < asOf) return false;
    return true;
}

export function isRateUpcoming(rate: TuitionRateRow, asOf: string): boolean {
    return Boolean(rate.effective_start && rate.effective_start > asOf);
}
