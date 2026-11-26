/**
 * Business Process stage status rollup — category-based selection (V2).
 */

import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

export const STATUS_ROLLUP_METADATA_KEY = "status_rollup_v1" as const;

export type StatusRollupCategoryKey =
    | "lead_statuses"
    | "enrollment_statuses"
    | "person_statuses"
    | "family_statuses"
    | "candidate_statuses"
    | "system_statuses";

export type StatusRollupCategoryV1 = {
    category_key: StatusRollupCategoryKey;
    entity_type: string;
    label: string;
    selected_status_keys: string[];
};

export type StatusRollupV1 = {
    version: 1;
    categories: StatusRollupCategoryV1[];
};

export type StatusCategoryStatusRow = {
    status_key: string;
    status_label: string;
    sort_order: number;
    /** Source entity for runtime persistence (enrollment may span opportunities + OCM). */
    entity_type: string;
};

export type StatusCategoryGroup = {
    category_key: StatusRollupCategoryKey;
    entity_type: string;
    label: string;
    statuses: StatusCategoryStatusRow[];
};

const CATEGORY_KEYS = new Set<string>([
    "lead_statuses",
    "enrollment_statuses",
    "person_statuses",
    "family_statuses",
    "candidate_statuses",
    "system_statuses",
]);

export const STATUS_CATEGORY_LABELS: Record<StatusRollupCategoryKey, string> = {
    lead_statuses: "Lead Statuses",
    enrollment_statuses: "Enrollment Participation",
    person_statuses: "People Statuses",
    family_statuses: "Family statuses",
    candidate_statuses: "Candidate statuses",
    system_statuses: "Advanced / system statuses",
};

export function isStatusRollupCategoryKey(value: string): value is StatusRollupCategoryKey {
    return CATEGORY_KEYS.has(value.trim());
}

function parseStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [
        ...new Set(
            value.map((v) => String(v ?? "").trim()).filter(Boolean)
        ),
    ];
}

export function parseStatusRollupV1(raw: unknown): StatusRollupV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    if (Number(record.version) !== 1) return null;
    if (!Array.isArray(record.categories)) return null;

    const categories: StatusRollupCategoryV1[] = [];
    for (const item of record.categories) {
        if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
        const row = item as Record<string, unknown>;
        const categoryKey = String(row.category_key ?? "").trim();
        if (!isStatusRollupCategoryKey(categoryKey)) continue;
        const entityType = String(row.entity_type ?? "").trim();
        if (!entityType) continue;
        const label =
            String(row.label ?? "").trim() || STATUS_CATEGORY_LABELS[categoryKey];
        categories.push({
            category_key: categoryKey,
            entity_type: entityType,
            label,
            selected_status_keys: parseStringArray(row.selected_status_keys),
        });
    }

    return categories.length ? { version: 1, categories } : null;
}

export function flattenStatusRollupKeys(rollup: StatusRollupV1 | null | undefined): string[] {
    if (!rollup?.categories.length) return [];
    const keys = new Set<string>();
    for (const cat of rollup.categories) {
        for (const key of cat.selected_status_keys) keys.add(key);
    }
    return [...keys];
}

export function enabledCategoryKeys(rollup: StatusRollupV1 | null | undefined): StatusRollupCategoryKey[] {
    return (rollup?.categories ?? []).map((c) => c.category_key);
}

export function selectedCountForCategory(
    rollup: StatusRollupV1 | null | undefined,
    categoryKey: StatusRollupCategoryKey
): number {
    const cat = rollup?.categories.find((c) => c.category_key === categoryKey);
    return cat?.selected_status_keys.length ?? 0;
}

export function isCategoryEnabled(
    rollup: StatusRollupV1 | null | undefined,
    categoryKey: StatusRollupCategoryKey
): boolean {
    return Boolean(rollup?.categories.some((c) => c.category_key === categoryKey));
}

export function toggleCategoryEnabled(
    rollup: StatusRollupV1,
    group: StatusCategoryGroup,
    enabled: boolean
): StatusRollupV1 {
    const existing = rollup.categories.filter((c) => c.category_key !== group.category_key);
    if (!enabled) return { version: 1, categories: existing };
    return {
        version: 1,
        categories: [
            ...existing,
            {
                category_key: group.category_key,
                entity_type: group.entity_type,
                label: group.label,
                selected_status_keys: [],
            },
        ],
    };
}

export function toggleStatusInRollup(
    rollup: StatusRollupV1,
    categoryKey: StatusRollupCategoryKey,
    statusKey: string,
    selected: boolean
): StatusRollupV1 {
    const key = statusKey.trim();
    if (!key) return rollup;
    return {
        version: 1,
        categories: rollup.categories.map((cat) => {
            if (cat.category_key !== categoryKey) return cat;
            const set = new Set(cat.selected_status_keys);
            if (selected) set.add(key);
            else set.delete(key);
            return { ...cat, selected_status_keys: [...set] };
        }),
    };
}

export function statusRollupDirty(
    saved: StatusRollupV1 | null | undefined,
    draft: StatusRollupV1 | null | undefined
): boolean {
    return JSON.stringify(saved ?? null) !== JSON.stringify(draft ?? null);
}

export function labelForStatusKey(
    catalog: readonly StatusCategoryGroup[],
    statusKey: string
): string {
    const key = statusKey.trim();
    for (const group of catalog) {
        const row = group.statuses.find((s) => s.status_key === key);
        if (row) return row.status_label;
    }
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function labelsForRollupKeys(
    catalog: readonly StatusCategoryGroup[],
    keys: readonly string[]
): string[] {
    return keys.map((k) => labelForStatusKey(catalog, k));
}
