/**
 * Bridge layout builder entity catalog fields into queue record layout editor fields.
 * Keeps queue column config aligned with records + entities = layout configuration.
 */

import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import type {
    QueueRecordFieldDisplay,
    QueueRecordLayoutField,
    QueueRecordLayoutFieldType,
    QueueRecordLayoutWidget,
    QueueRecordLinkBehavior,
} from "@/lib/layout/queueRecordLayoutConfig";
import { findCatalogEntry } from "@/lib/layout/queueRecordLayoutFieldCatalog";
import { nextQueueRecordFieldId } from "@/lib/layout/queueRecordLayoutIds";

function inferFieldType(f: LayoutCatalogField): QueueRecordLayoutFieldType {
    const rk = f.refKey.toLowerCase();
    if (/children|related_people|related_list/.test(rk)) return "related-record-chips";
    if (/status/.test(rk) && !/tour_status/.test(rk)) return "status";
    if (/attention|next_step/.test(rk)) return "attention";
    if (/date|tour|appointment|created_at|updated_at|desired_start/.test(rk) || f.fieldType === "date") {
        return "date";
    }
    return "field";
}

function inferDisplay(f: LayoutCatalogField, type: QueueRecordLayoutFieldType): QueueRecordFieldDisplay {
    if (type === "status") return "pill";
    if (type === "related-record-chips") return "chip";
    const rk = f.refKey.toLowerCase();
    if (/email|source|updated_at|record_id|\.id$/.test(rk)) return "muted";
    if (/name|contact|household|title/.test(rk)) return "link";
    return "text";
}

function inferLinkBehavior(f: LayoutCatalogField): QueueRecordLinkBehavior | undefined {
    const rk = f.refKey.toLowerCase();
    if (f.entityKey === "person" && /name|contact|phone|email/.test(rk)) return "open-drawer";
    if (f.entityKey === "child" || /body\.children|body\.child/.test(rk)) return "open-drawer";
    return undefined;
}

/** Map a layout catalog pick to a queue record editor field (stores canonical refKey). */
export function layoutCatalogFieldToQueueRecordField(f: LayoutCatalogField): QueueRecordLayoutField {
    const type = inferFieldType(f);
    return {
        id: nextQueueRecordFieldId(f.refKey.replace(/\./g, "-")),
        catalogId: `ref:${f.refKey}`,
        refKey: f.refKey,
        label: f.fieldLabel,
        type,
        entityType: f.entityKey,
        fieldPath: f.refKey,
        linkBehavior: inferLinkBehavior(f),
        display: inferDisplay(f, type),
    };
}

function inferWidgetTypeFromRefKey(refKey: string): QueueRecordLayoutWidget["type"] {
    const rk = refKey.toLowerCase();
    if (/body\.children|body\.child|children|related_people/.test(rk)) return "related-record-chips";
    if (/status/.test(rk) && !/tour_status/.test(rk)) return "status";
    if (/attention|next_step/.test(rk)) return "attention";
    if (/tour|appointment|created_at|updated_at|date|desired_start/.test(rk)) return "date";
    if (/program|location|room|campus|site/.test(rk)) return "context";
    if (/contact|person\./.test(rk)) return "contact";
    if (/title|household|identity|customer\./.test(rk)) return "identity";
    return "custom-field";
}

/** Resolve runtime widget from an editor field (refKey-first, legacy catalog fallback). */
export function queueRecordFieldToWidget(field: QueueRecordLayoutField): QueueRecordLayoutWidget | null {
    if (field.refKey) {
        const type = inferWidgetTypeFromRefKey(field.refKey);
        return {
            type,
            fieldPaths: [field.refKey],
            linkBehavior: field.linkBehavior,
            entityType: field.entityType,
        };
    }
    const entry = findCatalogEntry(field.catalogId);
    if (!entry || entry.fixedControl) return null;
    return {
        type: entry.widgetType,
        fieldPaths: entry.widgetFieldPaths ?? (entry.fieldPath ? [entry.fieldPath] : undefined),
        linkBehavior: entry.linkBehavior ?? field.linkBehavior,
        entityType: entry.entityType ?? field.entityType,
    };
}

export function queueRecordFieldRefKey(field: QueueRecordLayoutField): string | null {
    if (field.refKey) return field.refKey;
    const entry = findCatalogEntry(field.catalogId);
    return entry?.fieldPath ?? field.fieldPath ?? null;
}
