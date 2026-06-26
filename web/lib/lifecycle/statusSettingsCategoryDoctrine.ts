/**
 * Operator-facing status settings categories — shared by Settings → Statuses and BP picker.
 *
 * Doctrine:
 * - enrollment_statuses: process movement (family + child track vocabulary)
 * - lead_statuses: boring opportunity case/container state (Open, Closed, …)
 * - person_statuses: profile/identity state on persons
 * - system_statuses: advanced/debug only — hidden from BP picker
 */

import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { isGenericEnrollmentCaseContainerStatus } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import type { StatusRollupCategoryKey } from "@/lib/lifecycle/statusRollupV1";

export const STATUS_SETTINGS_CATEGORY_METADATA_KEY = "status_settings_category" as const;

export const BP_PICKER_VISIBLE_CATEGORY_KEYS: readonly StatusRollupCategoryKey[] = [
    "enrollment_statuses",
    "lead_statuses",
    "person_statuses",
] as const;

export const STATUS_SETTINGS_CATEGORY_DISPLAY_ORDER: readonly StatusRollupCategoryKey[] = [
    "enrollment_statuses",
    "lead_statuses",
    "person_statuses",
    "system_statuses",
] as const;

export const STATUS_SETTINGS_CATEGORY_DESCRIPTIONS: Record<
    Extract<StatusRollupCategoryKey, "enrollment_statuses" | "lead_statuses" | "person_statuses">,
    string
> = {
    enrollment_statuses:
        "",
    lead_statuses:
        "",
    person_statuses:
        "",
};

const ENROLLMENT_PROCESS_LAYERS = new Set([
    "enrollment_process",
    "lead_pipeline",
    "legacy_case_pipeline",
    "enrollment_disposition",
]);

function rowMetadata(row: StatusDefinitionRow): Record<string, unknown> | null {
    return row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
}

function metadataCategoryOverride(
    meta: Record<string, unknown> | null
): StatusRollupCategoryKey | null {
    const raw = meta?.[STATUS_SETTINGS_CATEGORY_METADATA_KEY];
    if (typeof raw !== "string") return null;
    const key = raw.trim();
    if (
        key === "enrollment_statuses" ||
        key === "lead_statuses" ||
        key === "person_statuses" ||
        key === "system_statuses"
    ) {
        return key;
    }
    return null;
}

export function isEnrollmentProcessStatusRow(row: StatusDefinitionRow): boolean {
    const meta = rowMetadata(row);
    const override = metadataCategoryOverride(meta);
    if (override === "enrollment_statuses") return true;
    if (override === "lead_statuses" || override === "system_statuses") return false;

    const layer = meta?.alloy_layer != null ? String(meta.alloy_layer) : null;
    if (layer && ENROLLMENT_PROCESS_LAYERS.has(layer)) return true;

    if (
        row.entity_type === "opportunity_customer_members" ||
        row.entity_type === "opportunity_customer_member"
    ) {
        return layer == null || layer === "enrollment_disposition";
    }

    if (row.entity_type === "opportunities" || row.entity_type === "opportunity") {
        if (isGenericEnrollmentCaseContainerStatus(row.status_key, meta)) return false;
        if (layer === "case_status") return false;
        if (meta?.process_key != null || meta?.process_stage_key != null || meta?.stage_key != null) {
            return true;
        }
        if (layer && ENROLLMENT_PROCESS_LAYERS.has(layer)) return true;
    }

    return false;
}

export function isLeadCaseContainerStatusRow(row: StatusDefinitionRow): boolean {
    const meta = rowMetadata(row);
    const override = metadataCategoryOverride(meta);
    if (override === "lead_statuses") return true;
    if (override === "enrollment_statuses" || override === "system_statuses") return false;

    if (row.entity_type !== "opportunities" && row.entity_type !== "opportunity") return false;
    if (isGenericEnrollmentCaseContainerStatus(row.status_key, meta)) return true;
    const layer = meta?.alloy_layer != null ? String(meta.alloy_layer) : null;
    return layer === "case_status";
}

export function isSystemOnlyStatusRow(row: StatusDefinitionRow): boolean {
    const meta = rowMetadata(row);
    const override = metadataCategoryOverride(meta);
    if (override === "system_statuses") return true;
    if (meta?.bp_picker_hidden === true) return true;
    return false;
}

export function resolveStatusSettingsCategoryKey(
    row: StatusDefinitionRow
): StatusRollupCategoryKey | null {
    const meta = rowMetadata(row);
    const override = metadataCategoryOverride(meta);
    if (override) return override;

    if (isSystemOnlyStatusRow(row)) return "system_statuses";
    if (isLeadCaseContainerStatusRow(row)) return "lead_statuses";
    if (isEnrollmentProcessStatusRow(row)) return "enrollment_statuses";

    if (row.entity_type === "persons") return "person_statuses";

    return null;
}
