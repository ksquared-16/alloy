/**
 * Queue record field catalog — business labels for the layout column builder.
 * Maps to internal widgets at save/runtime boundary.
 */

import type {
    QueueRecordLayoutField,
    QueueRecordLayoutFieldType,
    QueueRecordLayoutWidget,
    QueueRecordWidgetType,
} from "@/lib/layout/queueRecordLayoutConfig";
import { nextQueueRecordFieldId } from "@/lib/layout/queueRecordLayoutIds";

export type QueueRecordFieldCatalogEntry = {
    id: string;
    label: string;
    description?: string;
    category: string;
    type: QueueRecordLayoutFieldType;
    fieldPath?: string;
    entityType?: string;
    linkBehavior?: "open-drawer" | "none";
    display?: "text" | "pill" | "chip" | "muted" | "link";
    /** Internal widget mapping */
    widgetType: QueueRecordWidgetType;
    widgetFieldPaths?: string[];
    /** Fixed row controls — not addable to columns */
    fixedControl?: boolean;
};

export const QUEUE_RECORD_FIELD_CATALOG: QueueRecordFieldCatalogEntry[] = [
    {
        id: "household-name",
        label: "Household Name",
        category: "Lead / Opportunity",
        type: "field",
        fieldPath: "header.title",
        display: "text",
        widgetType: "identity",
        widgetFieldPaths: ["header.title", "header.identity"],
    },
    {
        id: "lead-status",
        label: "Lead Status",
        category: "Lead / Opportunity",
        type: "status",
        fieldPath: "header.status",
        display: "pill",
        widgetType: "status",
        widgetFieldPaths: ["header.status"],
    },
    {
        id: "source",
        label: "Source",
        category: "Lead / Opportunity",
        type: "custom",
        fieldPath: "opportunity.source",
        display: "muted",
        widgetType: "custom-field",
        widgetFieldPaths: ["opportunity.source"],
    },
    {
        id: "created-date",
        label: "Created Date",
        category: "Lead / Opportunity",
        type: "date",
        fieldPath: "opportunity.created_at",
        display: "text",
        widgetType: "date",
        widgetFieldPaths: ["opportunity.created_at"],
    },
    {
        id: "primary-contact-name",
        label: "Primary Contact Name",
        description: "Opens person drawer when clicked",
        category: "Primary Contact / Person",
        type: "field",
        fieldPath: "body.contact",
        linkBehavior: "open-drawer",
        entityType: "person",
        display: "link",
        widgetType: "contact",
        widgetFieldPaths: ["body.contact"],
    },
    {
        id: "phone",
        label: "Phone",
        category: "Primary Contact / Person",
        type: "field",
        fieldPath: "person.phone",
        display: "text",
        widgetType: "custom-field",
        widgetFieldPaths: ["body.contact"],
        entityType: "person",
    },
    {
        id: "email",
        label: "Email",
        category: "Primary Contact / Person",
        type: "field",
        fieldPath: "person.email",
        display: "muted",
        widgetType: "custom-field",
        widgetFieldPaths: ["body.contact"],
        entityType: "person",
    },
    {
        id: "children-chips",
        label: "Children as Chips",
        description: "Opens child drawer when a chip is clicked",
        category: "Related Records",
        type: "related-record-chips",
        fieldPath: "body.children",
        linkBehavior: "open-drawer",
        display: "chip",
        widgetType: "related-record-chips",
        widgetFieldPaths: ["body.children", "body.child"],
    },
    {
        id: "related-people-chips",
        label: "Related People as Chips",
        category: "Related Records",
        type: "related-record-chips",
        fieldPath: "body.related_people",
        linkBehavior: "open-drawer",
        display: "chip",
        widgetType: "related-record-chips",
        widgetFieldPaths: ["body.related_people"],
    },
    {
        id: "related-count",
        label: "Related Count",
        category: "Related Records",
        type: "custom",
        fieldPath: "body.children",
        display: "muted",
        widgetType: "custom-field",
        widgetFieldPaths: ["body.children"],
    },
    {
        id: "status",
        label: "Current Status",
        category: "Lifecycle / Work Unit",
        type: "status",
        fieldPath: "header.status",
        display: "pill",
        widgetType: "status",
        widgetFieldPaths: ["header.status"],
    },
    {
        id: "program",
        label: "Program",
        category: "Lifecycle / Work Unit",
        type: "custom",
        fieldPath: "body.program_fit",
        display: "text",
        widgetType: "context",
        widgetFieldPaths: ["body.program_fit", "child.program"],
    },
    {
        id: "location",
        label: "Location",
        category: "Lifecycle / Work Unit",
        type: "custom",
        fieldPath: "header.location",
        display: "text",
        widgetType: "context",
        widgetFieldPaths: ["header.location", "child.location"],
    },
    {
        id: "next-step",
        label: "Next Step",
        category: "Lifecycle / Work Unit",
        type: "attention",
        fieldPath: "next_step",
        display: "text",
        widgetType: "attention",
        widgetFieldPaths: ["context.primary", "next_step"],
    },
    {
        id: "attention-reason",
        label: "Attention Reason",
        category: "Lifecycle / Work Unit",
        type: "attention",
        fieldPath: "header.attention",
        display: "text",
        widgetType: "attention",
        widgetFieldPaths: ["header.attention"],
    },
    {
        id: "tour-date",
        label: "Tour Date",
        category: "Events / Dates",
        type: "date",
        fieldPath: "body.tour",
        display: "text",
        widgetType: "date",
        widgetFieldPaths: ["body.tour"],
    },
    {
        id: "appointment-date",
        label: "Appointment Date",
        category: "Events / Dates",
        type: "date",
        fieldPath: "body.appointment",
        display: "text",
        widgetType: "date",
        widgetFieldPaths: ["body.appointment"],
    },
    {
        id: "last-contacted",
        label: "Last Contacted Date",
        category: "Events / Dates",
        type: "date",
        fieldPath: "body.last_contacted",
        display: "muted",
        widgetType: "date",
        widgetFieldPaths: ["body.last_contacted"],
    },
    {
        id: "desired-start-date",
        label: "Desired Start Date",
        category: "Events / Dates",
        type: "date",
        fieldPath: "child.start_date",
        display: "text",
        widgetType: "date",
        widgetFieldPaths: ["child.start_date"],
    },
    {
        id: "record-id",
        label: "Record ID",
        category: "System",
        type: "custom",
        fieldPath: "opportunity.id",
        display: "muted",
        widgetType: "custom-field",
        widgetFieldPaths: ["opportunity.id"],
    },
    {
        id: "updated-at",
        label: "Updated At",
        category: "System",
        type: "custom",
        fieldPath: "opportunity.updated_at",
        display: "muted",
        widgetType: "custom-field",
        widgetFieldPaths: ["opportunity.updated_at"],
    },
    {
        id: "actions-menu",
        label: "Actions Menu",
        category: "System",
        type: "custom",
        widgetType: "actions",
        fixedControl: true,
    },
    {
        id: "work-with-bos",
        label: "Work with BOS",
        category: "System",
        type: "custom",
        widgetType: "actions",
        fixedControl: true,
    },
];

export function findCatalogEntry(catalogId: string): QueueRecordFieldCatalogEntry | undefined {
    return QUEUE_RECORD_FIELD_CATALOG.find((f) => f.id === catalogId);
}

export function catalogEntryToField(entry: QueueRecordFieldCatalogEntry): QueueRecordLayoutField {
    const id = nextQueueRecordFieldId(entry.id);
    return {
        id,
        catalogId: entry.id,
        label: entry.label,
        type: entry.type,
        kind: "field",
        fieldPath: entry.fieldPath,
        entityType: entry.entityType,
        linkBehavior: entry.linkBehavior,
        display: entry.display,
        rowId: id,
    };
}

export function fieldToWidget(field: QueueRecordLayoutField): QueueRecordLayoutWidget | null {
    const entry = findCatalogEntry(field.catalogId);
    if (!entry || entry.fixedControl) return null;
    return {
        type: entry.widgetType,
        fieldPaths: entry.widgetFieldPaths ?? (entry.fieldPath ? [entry.fieldPath] : undefined),
        linkBehavior: entry.linkBehavior ?? field.linkBehavior,
        entityType: entry.entityType ?? field.entityType,
    };
}

export function widgetsToFields(widgets: QueueRecordLayoutWidget[]): QueueRecordLayoutField[] {
    const fields: QueueRecordLayoutField[] = [];
    for (const widget of widgets) {
        if (widget.type === "actions") continue;
        const match = QUEUE_RECORD_FIELD_CATALOG.find(
            (e) =>
                !e.fixedControl &&
                e.widgetType === widget.type &&
                (e.widgetFieldPaths?.join(",") ?? "") === (widget.fieldPaths?.join(",") ?? ""),
        );
        if (match) {
            fields.push(catalogEntryToField(match));
            continue;
        }
        fields.push({
            id: nextQueueRecordFieldId(widget.type),
            catalogId: widget.type,
            label: widget.type,
            type:
                widget.type === "related-record-chips" ? "related-record-chips"
                : widget.type === "status" ? "status"
                : widget.type === "attention" ? "attention"
                : widget.type === "date" ? "date"
                : "custom",
            fieldPath: widget.fieldPaths?.[0],
            linkBehavior: widget.linkBehavior,
            entityType: widget.entityType,
        });
    }
    return fields;
}

/** @deprecated Use catalog field labels */
export function queueRecordFieldLabel(widget: QueueRecordLayoutWidget): string {
    const match = QUEUE_RECORD_FIELD_CATALOG.find(
        (e) =>
            e.widgetType === widget.type &&
            (e.widgetFieldPaths?.join(",") ?? "") === (widget.fieldPaths?.join(",") ?? ""),
    );
    return match?.label ?? widget.type;
}
