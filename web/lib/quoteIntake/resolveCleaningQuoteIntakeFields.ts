import type { CleaningQuoteCatalogBlob } from "@/lib/admin/loadCleaningQuoteCatalogForOrg";
import { formatFrequencyRowDisplayLabel } from "@/lib/book-v2/resolveCleaningFrequencyRpc";
import type { PricingFrequencyRow } from "@/lib/book-v2/loadCleaningPricingCatalog";
import type { QuoteIntakeFieldSpec, QuoteIntakeResolvedField, QuoteIntakeWorkflowSpec } from "@/lib/quoteIntake/types";

function frequencySelectOptions(rows: PricingFrequencyRow[]): { value: string; label: string }[] {
    const out: { value: string; label: string }[] = [];
    const oneOff = rows.find((r) => !r.is_recurring);
    out.push({
        value: "one_time",
        label: (oneOff?.frequency_label && String(oneOff.frequency_label).trim()) || "One-time",
    });
    for (const r of rows.filter((x) => x.is_recurring)) {
        out.push({
            value: r.frequency_key,
            label: formatFrequencyRowDisplayLabel(r),
        });
    }
    return out;
}

const FALLBACK_CLEANING_TYPE: { value: string; label: string }[] = [
    { value: "standard", label: "Standard cleaning" },
    { value: "move_out", label: "Move-out / heavy clean" },
];

/**
 * Attach resolved `options` to each field in a cleaning workflow using a catalog blob.
 */
export function resolveCleaningQuoteIntakeFields(
    workflow: QuoteIntakeWorkflowSpec,
    catalog: CleaningQuoteCatalogBlob
): QuoteIntakeResolvedField[] {
    const freqOpts = frequencySelectOptions(catalog.pricing_frequencies);

    const out: QuoteIntakeResolvedField[] = [];
    for (const f of [...workflow.fields].sort((a, b) => a.sort_order - b.sort_order)) {
        let options: { value: string; label: string; meta?: { price?: number } }[] = [];

        if (f.option_source.kind === "cleaning_catalog") {
            if (f.option_source.key === "square_footage_tiers") {
                options = catalog.square_footage_tiers.map((t) => ({
                    value: t.sqft_key,
                    label: t.sqft_label || t.tier_key,
                }));
            } else if (f.option_source.key === "pricing_frequencies") {
                options = freqOpts;
            } else if (f.option_source.key === "addons") {
                options = catalog.addons.map((a) => ({
                    value: a.id,
                    label: a.price > 0 ? `${a.label} (+$${a.price.toFixed(2)})` : a.label,
                    meta: { price: a.price },
                }));
            }
        } else if (f.option_source.kind === "option_set") {
            const k = f.option_source.set_key;
            const bucket = catalog.option_sets[k as keyof typeof catalog.option_sets];
            if (bucket?.length) {
                options = bucket.map((o) => ({ value: o.value, label: o.label }));
            }
        }

        if (f.quote_input_key === "cleaning_type" && options.length === 0) {
            options = FALLBACK_CLEANING_TYPE;
        }

        out.push({ ...f, options });
    }
    return out;
}

/** Map specialty_cleaning_type option value to RPC service_key inputs used by PATCH. */
export function mapCleaningTypeOptionToServiceKey(raw: string): "standard_cleaning" | "move_out_heavy" {
    const s = String(raw ?? "").trim().toLowerCase();
    if (!s) return "standard_cleaning";
    if (
        s === "move_out" ||
        s === "moveout" ||
        s.includes("move") ||
        s.includes("heavy") ||
        s.includes("move_out")
    ) {
        return "move_out_heavy";
    }
    return "standard_cleaning";
}

export function fieldSpecByQuoteInputKey(fields: QuoteIntakeFieldSpec[]): Map<string, QuoteIntakeFieldSpec> {
    return new Map(fields.map((f) => [f.quote_input_key, f]));
}
