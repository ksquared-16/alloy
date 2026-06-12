/**
 * Resolve status category groups from status_definitions rows.
 */

import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { personStatusAppliesToProfile, PERSON_STATUS_PROFILE_GENERIC } from "@/lib/admin/person/personStatusApplicability";
import {
    ENROLLMENT_TRACK_CHILD_KEY,
    ENROLLMENT_TRACK_FAMILY_KEY,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { isGenericEnrollmentCaseContainerStatus } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import {
    parseStatusRollupV1,
    STATUS_CATEGORY_LABELS,
    type StatusCategoryGroup,
    type StatusCategoryStatusRow,
    type StatusRollupCategoryKey,
    type StatusRollupV1,
} from "@/lib/lifecycle/statusRollupV1";
import { stageTrackKeyFromRecord } from "@/lib/lifecycle/stageStatusRollup";

function rowMetadata(row: StatusDefinitionRow): Record<string, unknown> | null {
    return row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
}

function mapStatusRow(row: StatusDefinitionRow): StatusCategoryStatusRow | null {
    if (row.is_active === false) return null;
    const label =
        (row.status_label && String(row.status_label).trim()) ||
        row.status_key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
        status_key: row.status_key,
        status_label: label,
        sort_order: Number(row.sort_order) ?? 100,
    };
}

export function resolveStatusCategoryKeyForRow(
    row: StatusDefinitionRow
): StatusRollupCategoryKey | null {
    const meta = rowMetadata(row);
    const layer = meta?.alloy_layer != null ? String(meta.alloy_layer) : null;

    if (row.entity_type === "opportunities") {
        if (isGenericEnrollmentCaseContainerStatus(row.status_key, meta)) return "system_statuses";
        if (layer === "case_status") return "system_statuses";
        if (layer === "lead_pipeline" || layer === "legacy_case_pipeline" || layer == null) {
            return "lead_statuses";
        }
        return "lead_statuses";
    }

    if (
        row.entity_type === "opportunity_customer_members" ||
        row.entity_type === "opportunity_customer_member"
    ) {
        if (layer === "enrollment_disposition" || layer == null) return "enrollment_statuses";
        return "enrollment_statuses";
    }

    if (row.entity_type === "persons") {
        if (personStatusAppliesToProfile(row, PERSON_STATUS_PROFILE_GENERIC)) {
            return "family_statuses";
        }
        return "person_statuses";
    }

    return null;
}

function sortRows(rows: StatusCategoryStatusRow[]): StatusCategoryStatusRow[] {
    return [...rows].sort(
        (a, b) => a.sort_order - b.sort_order || a.status_label.localeCompare(b.status_label)
    );
}

export function buildStatusCategoryCatalog(
    rows: readonly StatusDefinitionRow[]
): StatusCategoryGroup[] {
    const buckets = new Map<StatusRollupCategoryKey, StatusCategoryStatusRow[]>();

    for (const row of rows) {
        const category = resolveStatusCategoryKeyForRow(row);
        if (!category) continue;
        const mapped = mapStatusRow(row);
        if (!mapped) continue;
        const list = buckets.get(category) ?? [];
        if (!list.some((r) => r.status_key === mapped.status_key)) list.push(mapped);
        buckets.set(category, list);
    }

    const order: StatusRollupCategoryKey[] = [
        "lead_statuses",
        "enrollment_statuses",
        "person_statuses",
        "family_statuses",
        "candidate_statuses",
        "system_statuses",
    ];

    return order
        .filter((key) => (buckets.get(key)?.length ?? 0) > 0)
        .map((key) => ({
            category_key: key,
            entity_type: entityTypeForCategory(key),
            label: STATUS_CATEGORY_LABELS[key],
            statuses: sortRows(buckets.get(key) ?? []),
        }));
}

function entityTypeForCategory(key: StatusRollupCategoryKey): string {
    switch (key) {
        case "lead_statuses":
        case "system_statuses":
            return "opportunities";
        case "enrollment_statuses":
        case "candidate_statuses":
            return "opportunity_customer_members";
        case "person_statuses":
        case "family_statuses":
            return "persons";
    }
}

/** Enrollment template default enabled categories per stage track. */
export function defaultCategoryKeysForEnrollmentStage(
    stageKey: string,
    trackKey?: string | null
): StatusRollupCategoryKey[] {
    const track = stageTrackKeyFromRecord(stageKey, trackKey);
    if (track === ENROLLMENT_TRACK_CHILD_KEY) return ["enrollment_statuses"];
    if (track === ENROLLMENT_TRACK_FAMILY_KEY) return ["lead_statuses"];
    return ["lead_statuses"];
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

export function resolveStatusRollupForStage(params: {
    savedRollup: unknown;
    stageKey: string;
    trackKey?: string | null;
    catalog: readonly StatusCategoryGroup[];
    legacySelectedKeys?: readonly string[];
}): StatusRollupV1 {
    const parsed = parseStatusRollupV1(params.savedRollup);
    if (parsed?.categories.length) return parsed;

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
