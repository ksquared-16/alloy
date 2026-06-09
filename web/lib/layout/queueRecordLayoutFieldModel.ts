/**
 * Queue record layout field helpers — entity catalog picks, rows, layout items.
 */

import type { LayoutCatalogField, LayoutCatalogWidget } from "@/lib/layout/fieldCatalog";
import type { LayoutCondition, LayoutFieldAdornment, LayoutItem, LayoutRenderHint } from "@/lib/layout/layoutV2";
import type { QueueRecordLayoutField } from "@/lib/layout/queueRecordLayoutConfig";
import { layoutCatalogFieldToQueueRecordField } from "@/lib/layout/queueRecordLayoutCatalogBridge";
import { nextQueueRecordFieldId } from "@/lib/layout/queueRecordLayoutIds";

export type QueueRecordFieldRowGroup = {
    rowId: string;
    layout: "stack" | "inline";
    fields: QueueRecordLayoutField[];
};

export function layoutCatalogWidgetToQueueRecordField(widget: LayoutCatalogWidget): QueueRecordLayoutField {
    return {
        id: nextQueueRecordFieldId(widget.widgetKey),
        catalogId: `widget:${widget.widgetKey}`,
        label: widget.label,
        type: "custom",
        kind: "widget",
        widgetKey: widget.widgetKey,
        display: "text",
    };
}

export function queueRecordFieldToLayoutItem(field: QueueRecordLayoutField): LayoutItem {
    if (field.kind === "widget" && field.widgetKey) {
        return {
            id: field.id,
            kind: "widget_placeholder",
            refKey: field.widgetKey,
            label: field.label,
            widget: { widgetKey: field.widgetKey, displayMode: "text" },
            adornment: field.adornment,
            visibleWhen: field.visibleWhen,
        };
    }
    const refKey = field.refKey ?? field.fieldPath ?? field.catalogId;
    const renderHint: LayoutRenderHint =
        field.renderHint ??
        (field.type === "status" ? "status"
        : field.type === "date" ? "date"
        : field.display === "link" ? "link"
        : field.display === "pill" ? "badge"
        : "text");
    return {
        id: field.id,
        kind: "field",
        refKey,
        label: field.label,
        sourceEntity: field.entityType,
        renderHint,
        adornment: field.adornment,
        visibleWhen: field.visibleWhen,
    };
}

export function groupQueueRecordFieldsByRow(fields: QueueRecordLayoutField[]): QueueRecordFieldRowGroup[] {
    const order: string[] = [];
    const map = new Map<string, QueueRecordLayoutField[]>();
    for (const field of fields) {
        const rowId = field.rowId ?? field.id;
        if (!map.has(rowId)) {
            map.set(rowId, []);
            order.push(rowId);
        }
        map.get(rowId)!.push(field);
    }
    return order.map((rowId) => {
        const rowFields = map.get(rowId) ?? [];
        return {
            rowId,
            layout: rowFields.length > 1 || rowFields[0]?.rowLayout === "inline" ? "inline" : "stack",
            fields: rowFields,
        };
    });
}

export function patchQueueRecordField(
    fields: QueueRecordLayoutField[],
    fieldId: string,
    patch: Partial<QueueRecordLayoutField>,
): QueueRecordLayoutField[] {
    return fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f));
}

export function setQueueRecordFieldRowLayout(
    fields: QueueRecordLayoutField[],
    rowId: string,
    layout: "stack" | "inline",
): QueueRecordLayoutField[] {
    return fields.map((f) => {
        const rid = f.rowId ?? f.id;
        if (rid !== rowId) return f;
        return { ...f, rowLayout: layout };
    });
}

export function groupQueueRecordFieldInlineWithPrevious(
    fields: QueueRecordLayoutField[],
    fieldId: string,
): QueueRecordLayoutField[] {
    const index = fields.findIndex((f) => f.id === fieldId);
    if (index <= 0) return fields;
    const prev = fields[index - 1]!;
    const prevRowId = prev.rowId ?? prev.id;
    return fields.map((f, i) => {
        if (f.id !== fieldId) return f;
        return { ...f, rowId: prevRowId, rowLayout: "inline" };
    });
}

export function addLayoutCatalogFieldWithRow(
    fields: QueueRecordLayoutField[],
    catalogField: LayoutCatalogField,
): QueueRecordLayoutField[] {
    const next = layoutCatalogFieldToQueueRecordField(catalogField);
    next.rowId = next.id;
    if (fields.some((f) => (f.refKey ?? f.fieldPath) === catalogField.refKey)) return fields;
    return [...fields, next];
}

export function addLayoutCatalogWidgetWithRow(
    fields: QueueRecordLayoutField[],
    widget: LayoutCatalogWidget,
): QueueRecordLayoutField[] {
    const next = layoutCatalogWidgetToQueueRecordField(widget);
    next.rowId = next.id;
    const key = `widget:${widget.widgetKey}`;
    if (fields.some((f) => f.catalogId === key)) return fields;
    return [...fields, next];
}

export function queueRecordFieldUsedKey(field: QueueRecordLayoutField): string {
    if (field.kind === "widget" && field.widgetKey) return `widget:${field.widgetKey}`;
    return field.refKey ?? field.fieldPath ?? field.catalogId;
}

export function collectQueueRecordFieldUsedKeys(fields: QueueRecordLayoutField[]): Set<string> {
    return new Set(fields.map(queueRecordFieldUsedKey));
}
