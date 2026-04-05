import type { PricingFrequencyRow } from "@/lib/book-v2/loadCleaningPricingCatalog";
import { formatFrequencyRowDisplayLabel, resolveRpcFrequencyKey } from "@/lib/book-v2/resolveCleaningFrequencyRpc";

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
    const list = rows ?? [];
    if (!list.length) {
        const keys = campaignRecurringOnly
            ? (["weekly", "biweekly", "monthly"] as const)
            : (["one_time", "weekly", "biweekly", "monthly"] as const);
        return keys.map((value) => ({ value, label: frequencySelectionLabel(value, []) }));
    }
    const filtered = campaignRecurringOnly ? list.filter((r) => r.is_recurring) : list;
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    for (const r of filtered) {
        const value = r.is_recurring ? r.frequency_key : "one_time";
        if (seen.has(value)) continue;
        seen.add(value);
        out.push({ value, label: formatFrequencyRowDisplayLabel(r) });
    }
    return out;
}
