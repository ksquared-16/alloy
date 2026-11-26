import type { ProgramOffering } from "@/lib/programs/programOfferings";
import type { TuitionRateRow } from "@/lib/commercial/tuitionRates";
import type { BillingCadence } from "@/lib/commercial/billingCadences";
import {
    parseMetaString,
    TUITION_BILLING_FREQUENCY_META_KEY,
} from "@/lib/financials/tuitionPlans/tuitionPlanMetadata";

function readPlanBillingFrequencyKey(offering: ProgramOffering): string | null {
    return parseMetaString(offering.metadata, TUITION_BILLING_FREQUENCY_META_KEY);
}

export type BillingFrequencyRow = {
    id: string;
    itemKey: string;
    name: string;
    description: string | null;
    cadenceLabel: string;
    active: boolean;
    plansUsingCount: number;
    sortOrder: number;
    metadata: Record<string, unknown>;
};

export function isBillingFrequencyActive(metadata: Record<string, unknown>): boolean {
    if (metadata.active === false) return false;
    if (metadata.is_active === false) return false;
    return true;
}

function readCadenceDescription(metadata: Record<string, unknown>): string | null {
    const description =
        typeof metadata.description === "string"
            ? metadata.description.trim()
            : typeof metadata.interval_label === "string"
              ? metadata.interval_label.trim()
              : "";
    return description || null;
}

export function countBillingFrequencyUsage(
    cadenceKey: string,
    offerings: ProgramOffering[],
    rates: TuitionRateRow[],
): number {
    const planIds = new Set<string>();
    for (const offering of offerings) {
        const stored = readPlanBillingFrequencyKey(offering);
        if (stored === cadenceKey) planIds.add(offering.id);
    }
    for (const rate of rates) {
        if (rate.cadence_key === cadenceKey && rate.is_active !== false) {
            // rates tie to variants; count distinct offerings via variant linkage is approximate —
            // primary signal is offering metadata + any active rate on this cadence.
        }
    }
    // Also count offerings whose primary cadence is inferred only via rates (no metadata key)
    if (planIds.size === 0) {
        for (const offering of offerings) {
            if (readPlanBillingFrequencyKey(offering)) continue;
            const offeringRates = rates.filter((r) => r.cadence_key === cadenceKey && r.is_active !== false);
            if (offeringRates.length > 0) planIds.add(offering.id);
        }
    }
    return planIds.size;
}

export function buildBillingFrequencyRows(input: {
    cadences: BillingCadence[];
    offerings: ProgramOffering[];
    rates: TuitionRateRow[];
}): BillingFrequencyRow[] {
    return [...input.cadences]
        .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
        .map((cadence) => ({
            id: cadence.id,
            itemKey: cadence.item_key,
            name: cadence.label,
            description: readCadenceDescription(cadence.metadata),
            cadenceLabel: readCadenceDescription(cadence.metadata) ?? cadence.label,
            active: isBillingFrequencyActive(cadence.metadata),
            plansUsingCount: countBillingFrequencyUsage(cadence.item_key, input.offerings, input.rates),
            sortOrder: cadence.sort_order,
            metadata: cadence.metadata,
        }));
}

export function billingFrequencyItemKeyFromLabel(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 64);
}

export { TUITION_BILLING_FREQUENCY_META_KEY };
