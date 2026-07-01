/**
 * Validate queue_record_layout v3 — field scope + widget allow-list.
 */

import { isAllowedQueueRecordWidgetKey } from "@/lib/layout/queueRecordLayoutAllowList";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import { isAllowedQueueRecordFieldRefKey } from "@/lib/layout/surfaceLayoutRegistry";
import { buildTenantLayoutFieldRefKeySet } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { assertChildScopedFieldKey } from "@/lib/layout/runtime/queueRecordScopedResolve";
import { isWaitlistOnlyFieldKey } from "@/lib/layout/runtime/queueWaitlistPlacementField";
import { queueRecordActivityTimelineConfig } from "@/lib/layout/runtime/queueRecordWidgetConfig";

export type QueueRecordLayoutValidationIssue = {
    path: string;
    message: string;
};

export type QueueRecordLayoutValidationResult = {
    ok: boolean;
    errors: QueueRecordLayoutValidationIssue[];
    warnings: QueueRecordLayoutValidationIssue[];
};


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
    options?: { isWaitlist?: boolean; tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[] },
): QueueRecordLayoutValidationResult {
    const isWaitlist = options?.isWaitlist ?? false;
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
        errors.push({ path: "columns", message: "at least one column is required" });
        return { ok: false, errors, warnings };
    }

    config.columns.forEach((column, ci) => {
        const colPath = `columns[${ci}]`;
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
                            message: 'activity_timeline on queue rows must use compact display',
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

            const fields = block.type === "field_group" || block.type === "repeated_record_block" ? block.fields : [];
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

    return { ok: errors.length === 0, errors, warnings };
}
