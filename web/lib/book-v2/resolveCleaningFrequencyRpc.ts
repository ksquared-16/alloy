import type { CleaningFrequencyOption } from "@/lib/pricing/cleaningPricing";
import { mapFrequencyToKey } from "@/lib/pricing/supabasePricing";
import type { PricingFrequencyRow } from "@/lib/book-v2/loadCleaningPricingCatalog";

export type CleaningFrequencyApiKey = "one_time" | "weekly" | "biweekly" | "monthly";

/** UI label for a pricing_frequencies row (matches booking-config / refine display). */
export function formatFrequencyRowDisplayLabel(row: PricingFrequencyRow): string {
    return row.discount_label ? `${row.frequency_label} — ${row.discount_label}` : row.frequency_label;
}

function mapApiFrequencyToOption(freq: CleaningFrequencyApiKey | string | null | undefined): CleaningFrequencyOption {
    switch (freq) {
        case "weekly":
            return "Weekly (30% Off)";
        case "biweekly":
            return "Bi-Weekly (20% Off)";
        case "monthly":
            return "Monthly (10% Off)";
        default:
            return "One-time";
    }
}

/**
 * Value sent to get_quote_pricing.p_frequency_key: empty string = one-time; else DB frequency_key.
 * Accepts legacy API keys (weekly, …) or a raw pricing_frequencies.frequency_key.
 */
export function resolveRpcFrequencyKey(
    requested: string | null | undefined,
    rows: PricingFrequencyRow[]
): string {
    const s = String(requested ?? "").trim();
    if (!s || s === "one_time") return "";

    const direct = rows.find((r) => r.frequency_key === s);
    if (direct) {
        if (!direct.is_recurring) return "";
        return direct.frequency_key;
    }

    if (s === "weekly" || s === "biweekly" || s === "monthly") {
        const opt = mapApiFrequencyToOption(s as CleaningFrequencyApiKey);
        return mapFrequencyToKey(opt) ?? "";
    }

    return "";
}

/** Map RPC key back to legacy quote_input.cleaning_frequency for older clients / refine UI state. */
export function inferLegacyCleaningFrequencyApiKey(
    rpcKey: string,
    rows: PricingFrequencyRow[]
): CleaningFrequencyApiKey {
    const k = String(rpcKey ?? "").trim();
    if (!k) return "one_time";
    const row = rows.find((r) => r.frequency_key === k);
    if (row && !row.is_recurring) return "one_time";
    const fk = (row?.frequency_key ?? k).toLowerCase();
    if (fk.includes("bi") || fk.includes("2 week") || fk.includes("every 2")) return "biweekly";
    if (fk.includes("month")) return "monthly";
    if (fk.includes("week")) return "weekly";
    return "one_time";
}

export function frequencyRowForRpcKey(
    rpcKey: string,
    rows: PricingFrequencyRow[]
): PricingFrequencyRow | null {
    const k = String(rpcKey ?? "").trim();
    if (!k) {
        const oneOff = rows.find((r) => !r.is_recurring);
        return oneOff ?? null;
    }
    return rows.find((r) => r.frequency_key === k) ?? null;
}
