/**
 * Validate queue_record_layout v3 — field scope + widget allow-list.
 */

import { isAllowedQueueRecordWidgetKey } from "@/lib/layout/queueRecordLayoutAllowList";
import { filterCatalogFieldForScope } from "@/lib/layout/queueRecordScopeCatalog";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import { scopeAllowsFieldKey } from "@/lib/layout/runtime/queueRecordScopedResolve";

export type QueueRecordLayoutValidationIssue = {
    path: string;
    message: string;
};

export type QueueRecordLayoutValidationResult = {
    ok: boolean;
    errors: QueueRecordLayoutValidationIssue[];
    warnings: QueueRecordLayoutValidationIssue[];
};

function catalogFieldFromRefKey(refKey: string): LayoutCatalogField {
    const [entityKey, ...rest] = refKey.split(".");
    return {
        entityKey: entityKey ?? "opportunity",
        entityLabel: entityKey ?? "opportunity",
        fieldKey: rest.join(".") || refKey,
        fieldLabel: refKey,
        fieldType: "text",
        refKey,
    };
}

/** Validate v3 config against scope rules and widget allow-list (picker parity). */
export function validateQueueRecordLayoutConfig(
    config: QueueRecordLayoutConfigV3,
    options?: { isWaitlist?: boolean },
): QueueRecordLayoutValidationResult {
    const isWaitlist = options?.isWaitlist ?? false;
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
                return;
            }

            const fields = block.type === "field_group" || block.type === "repeated_record_block" ? block.fields : [];
            fields.forEach((field, fi) => {
                const fieldPath = `${blockPath}.fields[${fi}]`;
                if (!scopeAllowsFieldKey(column.scope, field.fieldKey)) {
                    errors.push({
                        path: `${fieldPath}.fieldKey`,
                        message: `field "${field.fieldKey}" is not allowed for scope ${column.scope.type}`,
                    });
                }
                const catalogField = catalogFieldFromRefKey(field.fieldKey);
                if (!filterCatalogFieldForScope(catalogField, column.scope)) {
                    warnings.push({
                        path: `${fieldPath}.fieldKey`,
                        message: `field "${field.fieldKey}" may not match column scope catalog rules`,
                    });
                }
            });
        });
    });

    return { ok: errors.length === 0, errors, warnings };
}
