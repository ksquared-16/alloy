/**
 * Configurable category primitives for Configuration workspaces.
 *
 * Org-specific labels and ordering come from `field_section_definitions` (GET /api/admin/field-sections).
 * Platform defaults seed create UX and grouping when the registry is empty or partial.
 */

import type { FieldSectionRegistryRow } from "@/lib/admin/fieldSectionSelectOptions";

export type ConfigurationCategoryOption = { value: string; label: string };

/** Platform category seeds — business organization, not presentation. */
export const PLATFORM_CATEGORY_CATALOG: ReadonlyArray<{
    key: string;
    label: string;
    sort_order: number;
}> = [
    { key: "identity", label: "Identity", sort_order: 10 },
    { key: "contact", label: "Contact", sort_order: 20 },
    { key: "enrollment", label: "Enrollment", sort_order: 30 },
    { key: "health", label: "Health", sort_order: 40 },
    { key: "medical", label: "Medical", sort_order: 50 },
    { key: "requirements", label: "Requirements", sort_order: 60 },
    { key: "attendance", label: "Attendance", sort_order: 70 },
    { key: "scheduling", label: "Scheduling", sort_order: 80 },
    { key: "communications", label: "Communications", sort_order: 90 },
    { key: "billing", label: "Billing", sort_order: 100 },
    { key: "licensing", label: "Licensing", sort_order: 110 },
    { key: "transportation", label: "Transportation", sort_order: 120 },
    { key: "behavior", label: "Behavior", sort_order: 130 },
    { key: "nutrition", label: "Nutrition", sort_order: 140 },
    { key: "placement", label: "Placement", sort_order: 150 },
    { key: "lifecycle", label: "Lifecycle", sort_order: 160 },
    { key: "runtime_signals", label: "Runtime Signals", sort_order: 170 },
    { key: "system", label: "System", sort_order: 180 },
    { key: "custom", label: "Custom", sort_order: 900 },
    { key: "general", label: "General", sort_order: 910 },
    { key: "site", label: "Site", sort_order: 920 },
];

const PLATFORM_LABEL_BY_KEY = new Map(PLATFORM_CATEGORY_CATALOG.map((c) => [c.key, c.label]));

export function platformCategoryLabel(categoryKey: string): string {
    const key = categoryKey.trim().toLowerCase();
    return PLATFORM_LABEL_BY_KEY.get(key) ?? titleCaseCategoryKey(key);
}

function titleCaseCategoryKey(key: string): string {
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function registryLabelMap(registry: readonly FieldSectionRegistryRow[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const row of registry) {
        if (row.section_key.trim()) {
            map.set(row.section_key, row.label.trim() || platformCategoryLabel(row.section_key));
        }
    }
    return map;
}

/** Resolve display label: org registry first, then platform seed, then title-case fallback. */
export function resolveConfigurationCategoryLabel(
    categoryKey: string,
    registry?: readonly FieldSectionRegistryRow[] | Map<string, string>,
): string {
    const key = categoryKey.trim().toLowerCase();
    if (!key) return "General";
    if (registry instanceof Map) {
        const fromRegistry = registry.get(key);
        if (fromRegistry) return fromRegistry;
    } else if (registry) {
        const row = registry.find((r) => r.section_key === key);
        if (row?.label?.trim()) return row.label.trim();
    }
    return platformCategoryLabel(key);
}

/**
 * Merge org registry, platform seeds, and legacy in-use keys for category pickers.
 * Registry rows win for label + order; platform seeds fill gaps; legacy keys append.
 */
export function buildConfigurationCategoryOptions(
    registry: readonly FieldSectionRegistryRow[],
    inUseCategoryKeys: Iterable<string>,
    options?: { includeSyntheticCustom?: boolean },
): ConfigurationCategoryOption[] {
    const includeSyntheticCustom = options?.includeSyntheticCustom !== false;
    const seen = new Set<string>();
    const out: ConfigurationCategoryOption[] = [];

    const regSorted = [...registry].sort(
        (a, b) => a.sort_order - b.sort_order || a.section_key.localeCompare(b.section_key),
    );
    for (const row of regSorted) {
        if (!row.section_key || seen.has(row.section_key)) continue;
        seen.add(row.section_key);
        out.push({
            value: row.section_key,
            label: row.label.trim() || platformCategoryLabel(row.section_key),
        });
    }

    const platformSorted = [...PLATFORM_CATEGORY_CATALOG].sort((a, b) => a.sort_order - b.sort_order);
    for (const seed of platformSorted) {
        if (seen.has(seed.key)) continue;
        seen.add(seed.key);
        out.push({ value: seed.key, label: seed.label });
    }

    for (const raw of [...inUseCategoryKeys].map((k) => String(k).trim()).filter(Boolean).sort()) {
        if (seen.has(raw)) continue;
        seen.add(raw);
        out.push({ value: raw, label: platformCategoryLabel(raw) });
    }

    if (includeSyntheticCustom && !seen.has("custom")) {
        out.push({ value: "custom", label: "Custom" });
    }

    return out;
}

export const PLATFORM_CATEGORY_SORT_ORDER = PLATFORM_CATEGORY_CATALOG.map((c) => c.key);
