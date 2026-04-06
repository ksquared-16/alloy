import type { PricingFrequencyRow } from "@/lib/book-v2/loadCleaningPricingCatalog";
import { formatFrequencyRowDisplayLabel, resolveRpcFrequencyKey } from "@/lib/book-v2/resolveCleaningFrequencyRpc";

/** When the DB only has recurring `pricing_frequencies` rows, quote/refine still need a one-time option. */
function withSyntheticOneTimeRow(rows: PricingFrequencyRow[]): PricingFrequencyRow[] {
    if (!rows.length || rows.some((r) => !r.is_recurring)) return rows;
    const synthetic: PricingFrequencyRow = {
        frequency_key: "synthetic_one_time",
        frequency_label: "One-time",
        discount_label: null,
        is_recurring: false,
    };
    return [synthetic, ...rows];
}

/** DB rows plus a synthetic one-time row when the catalog is recurring-only (standard cleaning). */
export function standardCleaningFrequencyCatalog(rows: PricingFrequencyRow[] | undefined): PricingFrequencyRow[] {
    return withSyntheticOneTimeRow(rows ?? []);
}

function frequencySelectionLabel(selection: string, rows: PricingFrequencyRow[] | null | undefined): string {
    if (!rows?.length) {
        const m: Record<string, string> = {
            one_time: "One-time",
            weekly: "Weekly",
            biweekly: "Every 2 weeks",
            monthly: "Monthly",
        };
        return m[selection] ?? selection;
    }
    const rpc = resolveRpcFrequencyKey(selection, rows);
    const row =
        rows.find((r) => r.frequency_key === rpc) ?? (!rpc ? rows.find((r) => !r.is_recurring) : undefined);
    if (row) return formatFrequencyRowDisplayLabel(row);
    return selection === "one_time" ? "One-time" : selection;
}

/**
 * Public quote UIs: options from `pricing_frequencies` when loaded, else legacy API-style keys.
 * `value` is what quote-start / quote-refine accept (`one_time` or `frequency_key`).
 */
export function catalogFrequencyChoices(
    rows: PricingFrequencyRow[] | undefined,
    campaignRecurringOnly: boolean
): { value: string; label: string }[] {
    const raw = rows ?? [];
    const base = campaignRecurringOnly ? raw.filter((r) => r.is_recurring) : standardCleaningFrequencyCatalog(raw);
    if (!base.length) {
        const keys = campaignRecurringOnly
            ? (["weekly", "biweekly", "monthly"] as const)
            : (["one_time", "weekly", "biweekly", "monthly"] as const);
        return keys.map((value) => ({ value, label: frequencySelectionLabel(value, []) }));
    }
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    for (const r of base) {
        const value = r.is_recurring ? r.frequency_key : "one_time";
        if (seen.has(value)) continue;
        seen.add(value);
        out.push({ value, label: formatFrequencyRowDisplayLabel(r) });
    }
    const oneTime = out.filter((o) => o.value === "one_time");
    const recurring = out.filter((o) => o.value !== "one_time");
    return [...oneTime, ...recurring];
}
