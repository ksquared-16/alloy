/**
 * Validate queue_record_layout v3 — field scope + widget allow-list + compact-row effectiveness.
 */

import { isAllowedQueueRecordWidgetKey } from "@/lib/layout/queueRecordLayoutAllowList";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import { isAllowedQueueRecordFieldRefKey } from "@/lib/layout/surfaceLayoutRegistry";
import { buildTenantLayoutFieldRefKeySet } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { assertChildScopedFieldKey } from "@/lib/layout/runtime/queueRecordScopedResolve";
import { isWaitlistOnlyFieldKey } from "@/lib/layout/runtime/queueWaitlistPlacementField";
import { queueRecordActivityTimelineConfig } from "@/lib/layout/runtime/queueRecordWidgetConfig";
import { isCompactRowEffectiveFieldKey } from "@/lib/presentation/runtime/queueRowSurfaceConfig";

export type QueueRecordLayoutValidationIssue = {
    path: string;
    message: string;
};

export type QueueRecordLayoutValidationResult = {
    ok: boolean;
    errors: QueueRecordLayoutValidationIssue[];
    warnings: QueueRecordLayoutValidationIssue[];
};

/** Operator-facing message when publishing a queue row with no configured columns. */
export const QUEUE_ROW_PUBLISH_EMPTY_COLUMNS_MESSAGE =
    "Add at least one item to the queue row before publishing.";

/** Operator-facing message when a field cannot render on the compact Work View row. */
export const QUEUE_ROW_PUBLISH_INEFFECTIVE_FIELD_MESSAGE =
    "This field is not supported on Work View queue rows. Choose a field that appears in the compact row (for example Children, contact, or status), or remove it before publishing.";

function collectColumnFieldKeys(
    columns: QueueRecordLayoutConfigV3["columns"],
): { path: string; fieldKey: string }[] {
    const out: { path: string; fieldKey: string }[] = [];
    columns.forEach((column, ci) => {
        column.blocks.forEach((block, bi) => {
            if (block.type !== "field_group" && block.type !== "repeated_record_block") return;
            block.fields.forEach((field, fi) => {
                const fieldKey = field.fieldKey.trim();
                if (!fieldKey) return;
                out.push({
                    path: `columns[${ci}].blocks[${bi}].fields[${fi}].fieldKey`,
                    fieldKey,
                });
            });
        });
    });
    return out;
}

function isValidQueueRecordFieldInBlock(
    fieldKey: string,
    block: QueueRecordLayoutConfigV3["columns"][number]["blocks"][number],
    isWaitlist: boolean,
    tenantFieldRefKeys?: ReadonlySet<string>,
): boolean {
    if (block.type === "repeated_record_block") {
        return assertChildScopedFieldKey(fieldKey, block.relationshipKey);
    }
    return isAllowedQueueRecordFieldRefKey(fieldKey, isWaitlist, tenantFieldRefKeys);
}

/** Validate v3 config against scope rules and widget allow-list (picker parity). */
export function validateQueueRecordLayoutConfig(
    config: QueueRecordLayoutConfigV3,
    options?: {
        isWaitlist?: boolean;
        tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
        /** When true (queue surface publish), reject fields the CondensedQueueRow cannot render. */
        requireCompactRowEffectiveFields?: boolean;
    },
): QueueRecordLayoutValidationResult {
    const isWaitlist = options?.isWaitlist ?? false;
    const requireCompact = options?.requireCompactRowEffectiveFields ?? false;
    const tenantFieldRefKeys =
        options?.tenantFieldDefinitions?.length ?
            buildTenantLayoutFieldRefKeySet(
                options.tenantFieldDefinitions,
                isWaitlist ? "waitlist_queue_row" : "pipeline_queue_row",
            )
        :   undefined;
    const errors: QueueRecordLayoutValidationIssue[] = [];
    const warnings: QueueRecordLayoutValidationIssue[] = [];

    if (config.variant !== "operational-row") {
        errors.push({ path: "variant", message: 'variant must be "operational-row"' });
    }
    if (config.version !== 3) {
        errors.push({ path: "version", message: "version must be 3" });
    }
    if (!Array.isArray(config.columns) || config.columns.length === 0) {
        errors.push({ path: "columns", message: QUEUE_ROW_PUBLISH_EMPTY_COLUMNS_MESSAGE });
        return { ok: false, errors, warnings };
    }

    const validateColumns = (
        columns: QueueRecordLayoutConfigV3["columns"],
        pathPrefix: string,
    ) => {
        columns.forEach((column, ci) => {
            const colPath = `${pathPrefix}[${ci}]`;
            column.blocks.forEach((block, bi) => {
                const blockPath = `${colPath}.blocks[${bi}]`;
                if (block.type === "widget") {
                    if (!isAllowedQueueRecordWidgetKey(block.widgetKey, isWaitlist)) {
                        errors.push({
                            path: `${blockPath}.widgetKey`,
                            message: `widget "${block.widgetKey}" is not allowed on ${isWaitlist ? "waitlist" : "pipeline"} queue rows`,
                        });
                    }
                    if (block.widgetKey === "activity_timeline") {
                        const timeline = queueRecordActivityTimelineConfig(block.config);
                        if (timeline.displayMode !== "compact_feed") {
                            errors.push({
                                path: `${blockPath}.config.displayMode`,
                                message: "activity_timeline on queue rows must use compact display",
                            });
                        }
                        if (timeline.maxItems < 1 || timeline.maxItems > 10) {
                            errors.push({
                                path: `${blockPath}.config.maxItems`,
                                message: "activity_timeline maxItems must be between 1 and 10 on queue rows",
                            });
                        }
                    }
                    return;
                }

                const fields =
                    block.type === "field_group" || block.type === "repeated_record_block" ? block.fields : [];
                fields.forEach((field, fi) => {
                    const fieldPath = `${blockPath}.fields[${fi}]`;
                    if (!isValidQueueRecordFieldInBlock(field.fieldKey, block, isWaitlist, tenantFieldRefKeys)) {
                        errors.push({
                            path: `${fieldPath}.fieldKey`,
                            message:
                                block.type === "repeated_record_block"
                                    ? `field "${field.fieldKey}" must be child-scoped inside a repeated ${block.relationshipKey} block`
                                    : `field "${field.fieldKey}" is not allowed on ${isWaitlist ? "waitlist" : "pipeline"} queue rows`,
                        });
                    }
                    if (!isWaitlist && isWaitlistOnlyFieldKey(field.fieldKey)) {
                        errors.push({
                            path: `${fieldPath}.fieldKey`,
                            message: `field "${field.fieldKey}" is only allowed on waitlist queue rows`,
                        });
                    }
                });
            });
        });
    };

    validateColumns(config.columns, "columns");

    if (Array.isArray(config.variants)) {
        config.variants.forEach((variant, vi) => {
            if (Array.isArray(variant.columns) && variant.columns.length > 0) {
                validateColumns(variant.columns, `variants[${vi}].columns`);
            }
        });
    }

    if (requireCompact) {
        const allColumns = [
            ...collectColumnFieldKeys(config.columns),
            ...(config.variants ?? []).flatMap((variant, vi) =>
                collectColumnFieldKeys(variant.columns ?? []).map((f) => ({
                    ...f,
                    path: `variants[${vi}].${f.path}`,
                })),
            ),
        ];
        for (const entry of allColumns) {
            if (!isCompactRowEffectiveFieldKey(entry.fieldKey)) {
                errors.push({
                    path: entry.path,
                    message: `${QUEUE_ROW_PUBLISH_INEFFECTIVE_FIELD_MESSAGE} (field: ${entry.fieldKey})`,
                });
            }
        }
    } else {
        for (const entry of collectColumnFieldKeys(config.columns)) {
            if (!isCompactRowEffectiveFieldKey(entry.fieldKey)) {
                warnings.push({
                    path: entry.path,
                    message: `Field "${entry.fieldKey}" is not rendered on Work View queue rows (compact anatomy).`,
                });
            }
        }
    }

    return { ok: errors.length === 0, errors, warnings };
}

/**
 * List published field keys that are not compact-row effective — runtime diagnostic for older
 * invalid saved configurations (silent omit → explicit signal).
 */
export function diagnoseIneffectiveQueueRowFieldKeys(
    config: QueueRecordLayoutConfigV3 | null | undefined,
): string[] {
    if (!config?.columns) return [];
    const keys = new Set<string>();
    for (const entry of collectColumnFieldKeys(config.columns)) {
        if (!isCompactRowEffectiveFieldKey(entry.fieldKey)) keys.add(entry.fieldKey);
    }
    for (const variant of config.variants ?? []) {
        for (const entry of collectColumnFieldKeys(variant.columns ?? [])) {
            if (!isCompactRowEffectiveFieldKey(entry.fieldKey)) keys.add(entry.fieldKey);
        }
    }
    return [...keys].sort();
}
