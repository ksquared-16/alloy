/**
 * Work View sort operands — canonical provider sort capability + legacy key reconciliation.
 */

import { providerSupportsSort } from "@/lib/fields/canonicalComparisonCapabilities";
import { assembleBusinessProcessProviders, resolveCanonicalProviderForConsumer } from "@/lib/fields/consumerCanonicalProviderAssembly";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import type { WorkViewSortV1 } from "@/lib/lifecycle/workViewsConfigV1";

export type WorkViewSortFieldOption = {
    key: string;
    label: string;
    source: "operational" | "canonical";
};

/** Legacy persisted sort keys → canonical refKey. */
export const LEGACY_WORK_VIEW_SORT_KEY_ALIASES: Readonly<Record<string, string>> = {
    tour_time: "opportunity.tour_date",
    priority: "queue_row.priority",
};

const OPERATIONAL_SORT_OPTIONS: readonly WorkViewSortFieldOption[] = [
    { key: "updated_at", label: "Updated", source: "operational" },
    { key: "created_at", label: "Created", source: "operational" },
    { key: "tour_time", label: "Tour time", source: "operational" },
    { key: "priority", label: "Priority", source: "operational" },
];

export function canonicalWorkViewSortFieldKey(fieldKey: string): string {
    const key = String(fieldKey ?? "").trim();
    return LEGACY_WORK_VIEW_SORT_KEY_ALIASES[key] ?? key;
}

export function resolveWorkViewSortFieldOptions(
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): WorkViewSortFieldOption[] {
    const merged = new Map<string, WorkViewSortFieldOption>();

    for (const option of OPERATIONAL_SORT_OPTIONS) {
        merged.set(option.key, option);
    }

    for (const provider of assembleBusinessProcessProviders({ tenantFieldDefinitions })) {
        if (!providerSupportsSort(provider)) continue;
        if (merged.has(provider.refKey)) {
            const existing = merged.get(provider.refKey)!;
            merged.set(provider.refKey, { ...existing, label: provider.label, source: "canonical" });
            continue;
        }
        merged.set(provider.refKey, {
            key: provider.refKey,
            label: provider.label,
            source: "canonical",
        });
    }

    return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function resolveWorkViewSortFieldLabel(
    fieldKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): string {
    const canonicalKey = canonicalWorkViewSortFieldKey(fieldKey);
    const provider = resolveCanonicalProviderForConsumer(canonicalKey, "business_process", {
        tenantFieldDefinitions,
    });
    if (provider?.label) return provider.label;
    const option = resolveWorkViewSortFieldOptions(tenantFieldDefinitions).find(
        (row) => row.key === fieldKey || row.key === canonicalKey,
    );
    return option?.label ?? fieldKey;
}

export function reconcileWorkViewSortRow(
    sort: WorkViewSortV1,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): WorkViewSortV1 {
    const field_key = canonicalWorkViewSortFieldKey(sort.field_key);
    const known = resolveWorkViewSortFieldOptions(tenantFieldDefinitions).some(
        (option) => option.key === sort.field_key || option.key === field_key,
    );
    if (!known && field_key !== sort.field_key) {
        return { ...sort, field_key };
    }
    return sort;
}

/** @deprecated Use {@link resolveWorkViewSortFieldOptions} — operational seed only. */
export const WORK_VIEW_SORT_FIELD_OPTIONS = OPERATIONAL_SORT_OPTIONS.map((row) => ({
    key: row.key,
    label: row.label,
}));
