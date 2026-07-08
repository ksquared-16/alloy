/**
 * Entity-owned category primitives for Configuration workspaces.
 *
 * Org labels and ordering come from `field_section_definitions` (GET /api/admin/field-sections).
 * Platform seeds are scoped per hub entity — operators never see unrelated entity categories.
 */

import type { FieldSectionRegistryRow } from "@/lib/admin/fieldSectionSelectOptions";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

export type ConfigurationCategoryOption = { value: string; label: string };

export type EntityCategorySeed = { key: string; label: string; sort_order: number };

/** Entity-owned default categories — business organization per object type. */
export const ENTITY_CATEGORY_SEEDS: Readonly<Record<SettingsHubEntityKey, readonly EntityCategorySeed[]>> = {
    person: [
        { key: "identity", label: "Identity", sort_order: 10 },
        { key: "contact", label: "Contact", sort_order: 20 },
        { key: "employment", label: "Employment", sort_order: 30 },
        { key: "emergency_contacts", label: "Emergency Contacts", sort_order: 40 },
        { key: "custom", label: "Custom", sort_order: 900 },
    ],
    inquiry_child: [
        { key: "identity", label: "Identity", sort_order: 10 },
        { key: "enrollment", label: "Enrollment", sort_order: 20 },
        { key: "medical", label: "Medical", sort_order: 30 },
        { key: "attendance", label: "Attendance", sort_order: 40 },
        { key: "behavior", label: "Behavior", sort_order: 50 },
        { key: "requirements", label: "Requirements", sort_order: 60 },
        { key: "custom", label: "Custom", sort_order: 900 },
    ],
    customer: [
        { key: "identity", label: "Identity", sort_order: 10 },
        { key: "contact", label: "Contact", sort_order: 20 },
        { key: "billing", label: "Billing", sort_order: 30 },
        { key: "communications", label: "Communications", sort_order: 40 },
        { key: "custom", label: "Custom", sort_order: 900 },
    ],
    opportunity: [
        { key: "identity", label: "Identity", sort_order: 10 },
        { key: "enrollment", label: "Enrollment", sort_order: 20 },
        { key: "requirements", label: "Requirements", sort_order: 30 },
        { key: "scheduling", label: "Scheduling", sort_order: 40 },
        { key: "custom", label: "Custom", sort_order: 900 },
    ],
    location: [
        { key: "identity", label: "Identity", sort_order: 10 },
        { key: "address", label: "Address", sort_order: 20 },
        { key: "programs", label: "Programs", sort_order: 30 },
        { key: "capacity", label: "Capacity", sort_order: 40 },
        { key: "licensing", label: "Licensing", sort_order: 50 },
        { key: "custom", label: "Custom", sort_order: 900 },
    ],
};

const FALLBACK_SEEDS: readonly EntityCategorySeed[] = [
    { key: "identity", label: "Identity", sort_order: 10 },
    { key: "custom", label: "Custom", sort_order: 900 },
];

export function entityCategorySeeds(hubEntity: SettingsHubEntityKey | string): readonly EntityCategorySeed[] {
    return ENTITY_CATEGORY_SEEDS[hubEntity as SettingsHubEntityKey] ?? FALLBACK_SEEDS;
}

const SEED_LABEL_BY_ENTITY = new Map<string, Map<string, string>>();
for (const [entity, seeds] of Object.entries(ENTITY_CATEGORY_SEEDS)) {
    SEED_LABEL_BY_ENTITY.set(entity, new Map(seeds.map((s) => [s.key, s.label])));
}

export function platformCategoryLabel(categoryKey: string, hubEntity?: SettingsHubEntityKey | string): string {
    const key = categoryKey.trim().toLowerCase();
    if (hubEntity) {
        const entityLabels = SEED_LABEL_BY_ENTITY.get(hubEntity);
        const fromEntity = entityLabels?.get(key);
        if (fromEntity) return fromEntity;
    }
    for (const labels of SEED_LABEL_BY_ENTITY.values()) {
        const match = labels.get(key);
        if (match) return match;
    }
    return titleCaseCategoryKey(key);
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

/** Resolve display label: org registry first, then entity seed, then title-case fallback. */
export function resolveConfigurationCategoryLabel(
    categoryKey: string,
    registry?: readonly FieldSectionRegistryRow[] | Map<string, string>,
    hubEntity?: SettingsHubEntityKey | string,
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
    return platformCategoryLabel(key, hubEntity);
}

/**
 * Entity-scoped category options: org registry + entity seeds + legacy in-use keys.
 * Never merges the full global catalog — unrelated entity categories stay hidden.
 */
export function buildConfigurationCategoryOptions(
    hubEntity: SettingsHubEntityKey | string,
    registry: readonly FieldSectionRegistryRow[],
    inUseCategoryKeys: Iterable<string>,
    options?: { includeSyntheticCustom?: boolean },
): ConfigurationCategoryOption[] {
    const includeSyntheticCustom = options?.includeSyntheticCustom !== false;
    const seen = new Set<string>();
    const out: ConfigurationCategoryOption[] = [];

    const activeRegistry = registry.filter((r) => !r.is_archived);
    const regSorted = [...activeRegistry].sort(
        (a, b) => a.sort_order - b.sort_order || a.section_key.localeCompare(b.section_key),
    );
    for (const row of regSorted) {
        if (!row.section_key || seen.has(row.section_key)) continue;
        seen.add(row.section_key);
        out.push({
            value: row.section_key,
            label: row.label.trim() || platformCategoryLabel(row.section_key, hubEntity),
        });
    }

    const seeds = [...entityCategorySeeds(hubEntity)].sort((a, b) => a.sort_order - b.sort_order);
    for (const seed of seeds) {
        if (seen.has(seed.key)) continue;
        seen.add(seed.key);
        out.push({ value: seed.key, label: seed.label });
    }

    for (const raw of [...inUseCategoryKeys].map((k) => String(k).trim()).filter(Boolean).sort()) {
        if (seen.has(raw)) continue;
        seen.add(raw);
        out.push({ value: raw, label: platformCategoryLabel(raw, hubEntity) });
    }

    if (includeSyntheticCustom && !seen.has("custom")) {
        out.push({ value: "custom", label: "Custom" });
    }

    return out;
}

/** Sort category group keys for an entity's field list. */
export function orderedEntityCategoryKeys(
    hubEntity: SettingsHubEntityKey | string,
    keys: Iterable<string>,
    registry?: readonly FieldSectionRegistryRow[],
): string[] {
    const keyList = [...keys];
    const seedOrder = new Map(entityCategorySeeds(hubEntity).map((s, i) => [s.key, s.sort_order]));
    const registryOrder = new Map(
        (registry ?? []).map((r) => [r.section_key, r.sort_order] as const),
    );

    return keyList.sort((a, b) => {
        const regA = registryOrder.get(a);
        const regB = registryOrder.get(b);
        if (regA != null && regB != null && regA !== regB) return regA - regB;
        if (regA != null && regB == null) return -1;
        if (regA == null && regB != null) return 1;
        const seedA = seedOrder.get(a) ?? 999;
        const seedB = seedOrder.get(b) ?? 999;
        if (seedA !== seedB) return seedA - seedB;
        return a.localeCompare(b);
    });
}

/** @deprecated Global catalog — prefer entityCategorySeeds() */
export const PLATFORM_CATEGORY_CATALOG = Object.values(ENTITY_CATEGORY_SEEDS).flat();
export const PLATFORM_CATEGORY_SORT_ORDER = entityCategorySeeds("person").map((c) => c.key);
