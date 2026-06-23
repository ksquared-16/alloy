/**
 * Queue row composer — context-first field picker (not scope-isolated).
 *
 * Column scope controls repeat/resolve behavior; Add Field shows all validator-
 * allowed contexts. Labels and groups come from `fieldPickerContextCatalog`.
 *
 * Invariant: pickerVisibleRefs ⊆ validatorAllowedQueueRecordFieldRefKeys
 */

import type { LayoutCatalogField, LayoutCatalogGroup, LayoutCatalogWidget } from "@/lib/layout/fieldCatalog";
import { GLOBAL_WIDGET_CATALOG } from "@/lib/layout/fieldCatalog";
import {
    classifyFieldPickerContext,
    FIELD_PICKER_CONTEXT_DESCRIPTIONS,
    FIELD_PICKER_CONTEXT_LABELS,
    FIELD_PICKER_CONTEXT_ORDER,
    isFieldPickerOperatorVisible,
    resolveFieldPickerLabel,
    type FieldPickerContextKey,
    type FieldPickerSurface,
} from "@/lib/layout/fieldPickerContextCatalog";
import { buildQueueRecordWidgetPickerCatalog } from "@/lib/layout/queueRecordLayoutAllowList";
import { assertChildScopedFieldKey } from "@/lib/layout/runtime/queueRecordScopedResolve";
import { validatorAllowedQueueRecordFieldRefKeys } from "@/lib/layout/queueRecordValidatorAllowList";
import {
    buildTenantLayoutCatalogFields,
    type TenantFieldDefinitionRow,
    type TenantLayoutFieldSurface,
} from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export type QueueRecordFieldContextKey = FieldPickerContextKey;

function queuePickerSurface(isWaitlist: boolean): FieldPickerSurface {
    return isWaitlist ? "waitlist_queue_row" : "pipeline_queue_row";
}

function catalogFieldForRefKey(refKey: string, surface: FieldPickerSurface): LayoutCatalogField {
    const [entityKey, ...rest] = refKey.split(".");
    const fieldLabel = resolveFieldPickerLabel(refKey, surface);
    return {
        entityKey: entityKey ?? "opportunity",
        entityLabel: entityKey ?? "opportunity",
        fieldKey: rest.join(".") || refKey,
        fieldLabel,
        fieldType: "text",
        refKey,
    };
}

export type QueueRecordPickerBlockFilter = "field_group" | "repeated_record_block" | "widget";

export type BuildQueueRecordPickerCatalogOptions = {
    isWaitlist: boolean;
    /** @deprecated Label source ignored — labels resolve via fieldPickerContextCatalog. */
    labelCatalogGroups?: LayoutCatalogGroup[];
    widgetCatalog?: readonly LayoutCatalogWidget[];
    /** Org tenant field_definitions — merged into picker and validation. */
    tenantFieldDefinitions?: readonly import("@/lib/layout/tenantLayoutFieldPickerCatalog").TenantFieldDefinitionRow[];
    /** Only repeated child blocks narrow picker fields; column scope never does. */
    blockFilter?: QueueRecordPickerBlockFilter;
    relationshipKey?: string;
};

/** Build full queue row picker catalog — never filtered by column scope. */
export function buildQueueRecordPickerCatalog(options: BuildQueueRecordPickerCatalogOptions): {
    groups: LayoutCatalogGroup[];
    widgets: LayoutCatalogWidget[];
    fieldCount: number;
    widgetCount: number;
    layoutKindLabel: string;
} {
    const groups = buildQueueRecordFieldPickerGroups(options.isWaitlist, {
        blockFilter: options.blockFilter,
        relationshipKey: options.relationshipKey ?? "children",
        tenantFieldDefinitions: options.tenantFieldDefinitions,
    });
    const widgets = buildQueueRecordWidgetPickerCatalog(options.widgetCatalog ?? GLOBAL_WIDGET_CATALOG);
    const fieldCount = groups.reduce((sum, g) => sum + g.fields.length, 0);
    return {
        groups,
        widgets,
        fieldCount,
        widgetCount: widgets.length,
        layoutKindLabel: options.isWaitlist ? "Waitlist queue row" : "Pipeline queue row",
    };
}

function queueLayoutSurface(isWaitlist: boolean): TenantLayoutFieldSurface {
    return isWaitlist ? "waitlist_queue_row" : "pipeline_queue_row";
}

/**
 * Build picker fields from validator allow-list + tenant custom fields + shared operator labels.
 */
export function buildQueueRecordPickerFieldsFromAllowList(
    isWaitlist: boolean,
    options?: Pick<
        BuildQueueRecordPickerCatalogOptions,
        "blockFilter" | "relationshipKey" | "tenantFieldDefinitions"
    >,
): LayoutCatalogField[] {
    const surface = queuePickerSurface(isWaitlist);
    const layoutSurface = queueLayoutSurface(isWaitlist);
    const childBlockOnly = options?.blockFilter === "repeated_record_block";
    const relationshipKey = options?.relationshipKey ?? "children";
    const tenantDefs = options?.tenantFieldDefinitions ?? [];

    const staticFields = validatorAllowedQueueRecordFieldRefKeys(isWaitlist).flatMap((refKey) => {
        if (!isFieldPickerOperatorVisible(refKey, surface)) return [];
        if (childBlockOnly && !assertChildScopedFieldKey(refKey, relationshipKey)) return [];
        const context = classifyFieldPickerContext(refKey, { surface, isWaitlist });
        if (!context) return [];
        const field = catalogFieldForRefKey(refKey, surface);
        return [{ ...field, entityLabel: FIELD_PICKER_CONTEXT_LABELS[context] }];
    });

    const staticRefs = new Set(staticFields.map((f) => f.refKey));
    const tenantFields = buildTenantLayoutCatalogFields(tenantDefs, layoutSurface).flatMap((field) => {
        if (staticRefs.has(field.refKey)) return [];
        if (childBlockOnly && !assertChildScopedFieldKey(field.refKey, relationshipKey)) return [];
        const context = classifyFieldPickerContext(field.refKey, { surface, isWaitlist });
        if (!context) return [];
        return [{ ...field, entityLabel: FIELD_PICKER_CONTEXT_LABELS[context] }];
    });

    return [...staticFields, ...tenantFields];
}

/**
 * Build context-first picker groups for queue row Add Field.
 * Independent of column scope — only repeated_record_block narrows fields.
 */
export function buildQueueRecordFieldPickerGroups(
    isWaitlist: boolean,
    options?: Pick<
        BuildQueueRecordPickerCatalogOptions,
        "blockFilter" | "relationshipKey" | "tenantFieldDefinitions"
    >,
): LayoutCatalogGroup[] {
    const surface = queuePickerSurface(isWaitlist);
    const fields = buildQueueRecordPickerFieldsFromAllowList(isWaitlist, options);
    const buckets = new Map<FieldPickerContextKey, LayoutCatalogField[]>();

    for (const field of fields) {
        const context = classifyFieldPickerContext(field.refKey, { surface, isWaitlist });
        if (!context) continue;
        const bucket = buckets.get(context) ?? [];
        bucket.push(field);
        buckets.set(context, bucket);
    }

    return FIELD_PICKER_CONTEXT_ORDER.flatMap((contextKey) => {
        const groupFields = buckets.get(contextKey);
        if (!groupFields?.length) return [];
        groupFields.sort((a, b) => a.fieldLabel.localeCompare(b.fieldLabel));
        return [
            {
                entityKey: contextKey,
                entityLabel: FIELD_PICKER_CONTEXT_LABELS[contextKey],
                groupDescription: FIELD_PICKER_CONTEXT_DESCRIPTIONS[contextKey],
                fields: groupFields,
            },
        ];
    });
}

/** @deprecated Pass isWaitlist only — label catalog groups no longer used for labels. */
export function classifyQueueRecordFieldContext(
    refKey: string,
    isWaitlist: boolean,
): FieldPickerContextKey | null {
    return classifyFieldPickerContext(refKey, {
        surface: queuePickerSurface(isWaitlist),
        isWaitlist,
    });
}

/** Flat list of all queue-safe picker fields (for cross-group search). */
export function flattenQueueRecordFieldPickerFields(groups: LayoutCatalogGroup[]): LayoutCatalogField[] {
    return groups.flatMap((g) =>
        g.fields.map((f) => ({
            ...f,
            entityLabel: g.entityLabel,
        })),
    );
}

/** Picker-visible ref keys — must be subset of validator allow-list. */
export function queueRecordPickerVisibleRefKeys(
    _labelCatalogGroups: LayoutCatalogGroup[],
    isWaitlist: boolean,
    options?: Pick<
        BuildQueueRecordPickerCatalogOptions,
        "blockFilter" | "relationshipKey" | "tenantFieldDefinitions"
    >,
): string[] {
    return buildQueueRecordPickerFieldsFromAllowList(isWaitlist, options).map((f) => f.refKey);
}

/** Tenant custom ref keys allowed on queue row picker for validation parity. */
export function queueRecordTenantPickerRefKeys(
    isWaitlist: boolean,
    tenantFieldDefinitions: readonly TenantFieldDefinitionRow[],
): string[] {
    return buildTenantLayoutCatalogFields(tenantFieldDefinitions, queueLayoutSurface(isWaitlist)).map(
        (f) => f.refKey,
    );
}
