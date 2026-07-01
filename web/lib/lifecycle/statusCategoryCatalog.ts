/**
 * Resolve status category groups from status_definitions rows.
 */

import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import {
    BP_PICKER_VISIBLE_CATEGORY_KEYS,
    resolveStatusSettingsCategoryKey,
    STATUS_SETTINGS_CATEGORY_DISPLAY_ORDER,
} from "@/lib/lifecycle/statusSettingsCategoryDoctrine";
import {
    parseStatusRollupV1,
    STATUS_CATEGORY_LABELS,
    type StatusCategoryGroup,
    type StatusCategoryStatusRow,
    type StatusRollupCategoryKey,
    type StatusRollupV1,
} from "@/lib/lifecycle/statusRollupV1";

function mapStatusRow(row: StatusDefinitionRow): StatusCategoryStatusRow | null {
    if (row.is_active === false) return null;
    const label =
        (row.status_label && String(row.status_label).trim()) ||
        row.status_key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
        status_key: row.status_key,
        status_label: label,
        sort_order: Number(row.sort_order) ?? 100,
        entity_type: row.entity_type,
    };
}

function sortRows(rows: StatusCategoryStatusRow[]): StatusCategoryStatusRow[] {
    return [...rows].sort(
        (a, b) => a.sort_order - b.sort_order || a.status_label.localeCompare(b.status_label)
    );
}

function sortEnrollmentCategoryRows(rows: StatusCategoryStatusRow[]): StatusCategoryStatusRow[] {
    const family = sortRows(rows.filter((r) => r.entity_type === "opportunities"));
    const child = sortRows(
        rows.filter(
            (r) =>
                r.entity_type === "opportunity_customer_members" ||
                r.entity_type === "opportunity_customer_member"
        )
    );
    const other = sortRows(
        rows.filter(
            (r) =>
                r.entity_type !== "opportunities" &&
                r.entity_type !== "opportunity" &&
                r.entity_type !== "opportunity_customer_members" &&
                r.entity_type !== "opportunity_customer_member"
        )
    );
    return [...family, ...child, ...other];
}

/** @deprecated Use resolveStatusSettingsCategoryKey — kept for tests during transition. */
export function resolveStatusCategoryKeyForRow(
    row: StatusDefinitionRow
): StatusRollupCategoryKey | null {
    return resolveStatusSettingsCategoryKey(row);
}

export type BuildStatusCategoryCatalogOptions = {
    /** When false, omit system_statuses (Business Process picker). */
    includeSystemCategories?: boolean;
    /** When set, only include these category keys. */
    categoryKeys?: readonly StatusRollupCategoryKey[];
};

export function buildStatusCategoryCatalog(
    rows: readonly StatusDefinitionRow[],
    options: BuildStatusCategoryCatalogOptions = {}
): StatusCategoryGroup[] {
    const includeSystem = options.includeSystemCategories !== false;
    const allowedKeys = options.categoryKeys ?? null;
    const buckets = new Map<StatusRollupCategoryKey, StatusCategoryStatusRow[]>();

    for (const row of rows) {
        const category = resolveStatusSettingsCategoryKey(row);
        if (!category) continue;
        if (!includeSystem && category === "system_statuses") continue;
        if (allowedKeys && !allowedKeys.includes(category)) continue;
        const mapped = mapStatusRow(row);
        if (!mapped) continue;
        const list = buckets.get(category) ?? [];
        const dedupeKey = `${mapped.entity_type}:${mapped.status_key}`;
        if (!list.some((r) => `${r.entity_type}:${r.status_key}` === dedupeKey)) list.push(mapped);
        buckets.set(category, list);
    }

    const order = allowedKeys ?? STATUS_SETTINGS_CATEGORY_DISPLAY_ORDER;

    return order
        .filter((key) => {
            if (!includeSystem && key === "system_statuses") return false;
            return (buckets.get(key)?.length ?? 0) > 0;
        })
        .map((key) => ({
            category_key: key,
            entity_type: entityTypeForCategory(key),
            label: STATUS_CATEGORY_LABELS[key],
            statuses:
                key === "enrollment_statuses"
                    ? sortEnrollmentCategoryRows(buckets.get(key) ?? [])
                    : sortRows(buckets.get(key) ?? []),
        }));
}

/** Catalog for Business Process stage picker — same inventory as Settings, minus system. */
export function buildBusinessProcessStatusCategoryCatalog(
    rows: readonly StatusDefinitionRow[]
): StatusCategoryGroup[] {
    return buildStatusCategoryCatalog(rows, {
        includeSystemCategories: false,
        categoryKeys: BP_PICKER_VISIBLE_CATEGORY_KEYS,
    });
}

function entityTypeForCategory(key: StatusRollupCategoryKey): string {
    switch (key) {
        case "lead_statuses":
        case "system_statuses":
            return "opportunities";
        case "enrollment_statuses":
            return "enrollment_mixed";
        case "person_statuses":
        case "family_statuses":
            return "persons";
        case "candidate_statuses":
            return "opportunity_customer_members";
    }
}

export function entityTypeForStatusKeyInCatalog(
    catalog: readonly StatusCategoryGroup[],
    statusKey: string
): string | null {
    const key = statusKey.trim();
    if (!key) return null;
    for (const group of catalog) {
        const row = group.statuses.find((s) => s.status_key === key);
        if (row) return row.entity_type;
    }
    return null;
}

export function groupSelectedKeysByEntityType(
    catalog: readonly StatusCategoryGroup[],
    keys: readonly string[]
): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const key of keys) {
        const entityType = entityTypeForStatusKeyInCatalog(catalog, key);
        if (!entityType) continue;
        const list = out.get(entityType) ?? [];
        list.push(key);
        out.set(entityType, list);
    }
    return out;
}

/** Enrollment process stages default to Enrollment Statuses only. */
export function defaultCategoryKeysForEnrollmentStage(
    _stageKey: string,
    _trackKey?: string | null
): StatusRollupCategoryKey[] {
    return ["enrollment_statuses"];
}

export function assignKeysToCategories(
    catalog: readonly StatusCategoryGroup[],
    enabledCategoryKeys: readonly StatusRollupCategoryKey[],
    selectedKeys: readonly string[]
): StatusRollupV1 {
    const keySet = new Set(selectedKeys.map((k) => k.trim()).filter(Boolean));
    const categories = enabledCategoryKeys
        .map((categoryKey) => {
            const group = catalog.find((g) => g.category_key === categoryKey);
            if (!group) return null;
            const selected_status_keys = group.statuses
                .map((s) => s.status_key)
                .filter((k) => keySet.has(k));
            return {
                category_key: categoryKey,
                entity_type: group.entity_type,
                label: group.label,
                selected_status_keys,
            };
        })
        .filter((c): c is NonNullable<typeof c> => c != null);
    return { version: 1, categories };
}

function migrateLegacyRollupCategories(
    rollup: StatusRollupV1,
    catalog: readonly StatusCategoryGroup[]
): StatusRollupV1 {
    const enrollmentGroup = catalog.find((g) => g.category_key === "enrollment_statuses");
    const leadGroup = catalog.find((g) => g.category_key === "lead_statuses");
    if (!enrollmentGroup) return rollup;

    const enrollmentKeySet = new Set(enrollmentGroup.statuses.map((s) => s.status_key));
    const leadKeySet = new Set(leadGroup?.statuses.map((s) => s.status_key) ?? []);
    const enabled = new Set(rollup.categories.map((c) => c.category_key));
    const allSelected = rollup.categories.flatMap((c) => c.selected_status_keys);

    const enrollmentKeys = [
        ...new Set(allSelected.filter((k) => enrollmentKeySet.has(k))),
    ];
    const leadKeys = [
        ...new Set(allSelected.filter((k) => leadKeySet.has(k) && !enrollmentKeySet.has(k))),
    ];

    if (enabled.has("lead_statuses") && enrollmentKeys.length) {
        enabled.add("enrollment_statuses");
    }

    const otherCategories = rollup.categories.filter(
        (c) =>
            c.category_key !== "enrollment_statuses" &&
            c.category_key !== "lead_statuses" &&
            c.category_key !== "system_statuses"
    );

    const categories = [...otherCategories];
    if (enabled.has("enrollment_statuses")) {
        categories.push({
            category_key: "enrollment_statuses",
            entity_type: enrollmentGroup.entity_type,
            label: enrollmentGroup.label,
            selected_status_keys: enrollmentKeys,
        });
    }
    if (enabled.has("lead_statuses")) {
        categories.push({
            category_key: "lead_statuses",
            entity_type: leadGroup?.entity_type ?? "opportunities",
            label: leadGroup?.label ?? STATUS_CATEGORY_LABELS.lead_statuses,
            selected_status_keys: leadKeys,
        });
    }

    return { version: 1, categories };
}

export function resolveStatusRollupForStage(params: {
    savedRollup: unknown;
    stageKey: string;
    trackKey?: string | null;
    catalog: readonly StatusCategoryGroup[];
    legacySelectedKeys?: readonly string[];
}): StatusRollupV1 {
    const parsed = parseStatusRollupV1(params.savedRollup);
    if (parsed?.categories.length) {
        return migrateLegacyRollupCategories(parsed, params.catalog);
    }

    const defaults = defaultCategoryKeysForEnrollmentStage(params.stageKey, params.trackKey);
    const legacyKeys = params.legacySelectedKeys ?? [];
    if (legacyKeys.length) {
        return assignKeysToCategories(params.catalog, defaults, legacyKeys);
    }

    return {
        version: 1,
        categories: defaults
            .map((key) => {
                const group = params.catalog.find((g) => g.category_key === key);
                if (!group) return null;
                return {
                    category_key: key,
                    entity_type: group.entity_type,
                    label: group.label,
                    selected_status_keys: [],
                };
            })
            .filter((c): c is NonNullable<typeof c> => c != null),
    };
}
