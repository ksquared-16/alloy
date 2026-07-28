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
    "This field is not supported on Work View queue rows. Remove it, or choose a compact-row field such as a Children summary, contact, or status.";

export type IneffectiveQueueRowFieldDiagnostic = {
    fieldKey: string;
    /** Operator label when present on the layout field; otherwise the field key. */
    fieldLabel: string;
    /** `default` or the variant id / match label. */
    variantKey: string;
    path: string;
    message: string;
};

function collectColumnFieldKeys(
    columns: QueueRecordLayoutConfigV3["columns"],
    pathPrefix = "columns",
): { path: string; fieldKey: string; fieldLabel: string }[] {
    const out: { path: string; fieldKey: string; fieldLabel: string }[] = [];
    columns.forEach((column, ci) => {
        column.blocks.forEach((block, bi) => {
            if (block.type !== "field_group" && block.type !== "repeated_record_block") return;
            block.fields.forEach((field, fi) => {
                const fieldKey = field.fieldKey.trim();
                if (!fieldKey) return;
                out.push({
                    path: `${pathPrefix}[${ci}].blocks[${bi}].fields[${fi}].fieldKey`,
                    fieldKey,
                    fieldLabel: (field.label ?? "").trim() || fieldKey,
                });
            });
        });
    });
    return out;
}

function variantDiagnosticKey(
    variant: NonNullable<QueueRecordLayoutConfigV3["variants"]>[number],
    index: number,
): string {
    const id = typeof variant.id === "string" ? variant.id.trim() : "";
    if (id) return id;
    const label = typeof variant.label === "string" ? variant.label.trim() : "";
    if (label) return label;
    return `variant_${index}`;
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
        for (const issue of diagnoseIneffectiveQueueRowFields(config)) {
            errors.push({
                path: issue.path,
                message: issue.message,
            });
        }
    } else {
        for (const entry of collectColumnFieldKeys(config.columns)) {
            if (!isCompactRowEffectiveFieldKey(entry.fieldKey)) {
                warnings.push({
                    path: entry.path,
                    message: `Field "${entry.fieldLabel}" (${entry.fieldKey}) is not rendered on Work View queue rows (compact anatomy).`,
                });
            }
        }
    }

    return { ok: errors.length === 0, errors, warnings };
}

/**
 * Structured diagnostics for published/draft fields that are not compact-row effective.
 * Scans Default columns and only variants that actually contain fields (empty inherited
 * variants do not produce false failures).
 */
export function diagnoseIneffectiveQueueRowFields(
    config: QueueRecordLayoutConfigV3 | null | undefined,
): IneffectiveQueueRowFieldDiagnostic[] {
    if (!config?.columns) return [];
    const out: IneffectiveQueueRowFieldDiagnostic[] = [];

    const pushEntries = (
        entries: ReturnType<typeof collectColumnFieldKeys>,
        variantKey: string,
    ) => {
        for (const entry of entries) {
            if (isCompactRowEffectiveFieldKey(entry.fieldKey)) continue;
            out.push({
                fieldKey: entry.fieldKey,
                fieldLabel: entry.fieldLabel,
                variantKey,
                path: entry.path,
                message: `${QUEUE_ROW_PUBLISH_INEFFECTIVE_FIELD_MESSAGE} (field: ${entry.fieldLabel} · key: ${entry.fieldKey} · variant: ${variantKey})`,
            });
        }
    };

    pushEntries(collectColumnFieldKeys(config.columns, "columns"), "default");

    (config.variants ?? []).forEach((variant, vi) => {
        const entries = collectColumnFieldKeys(variant.columns ?? [], `variants[${vi}].columns`);
        if (entries.length === 0) return;
        pushEntries(entries, variantDiagnosticKey(variant, vi));
    });

    return out;
}

/**
 * List published field keys that are not compact-row effective — runtime diagnostic for older
 * invalid saved configurations (silent omit → explicit signal).
 */
export function diagnoseIneffectiveQueueRowFieldKeys(
    config: QueueRecordLayoutConfigV3 | null | undefined,
): string[] {
    return [...new Set(diagnoseIneffectiveQueueRowFields(config).map((d) => d.fieldKey))].sort();
}
