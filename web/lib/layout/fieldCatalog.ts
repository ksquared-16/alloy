/**
 * Layout V2 — Field & Widget Catalog (Layout Builder V1).
 *
 * Normalizes fields from several sources into a single shape the builder's
 * field picker can use, restricted to the V1 entity groups (Lead/Opportunity,
 * Person/Contact, Child, Children Inquiry). Layout entity_type stays
 * `opportunities`; fields reference related entities via NAMESPACED refKeys
 * (e.g. `opportunity.status_key`, `person.primary_phone`, `child.name`).
 *
 * Normalized field entry:
 *   { entityKey, entityLabel, fieldKey, fieldLabel, fieldType, refKey }
 *
 * Where exact hydration of a related field isn't available yet, the layout
 * still preserves the intended source (refKey) and the proof renderer shows a
 * placeholder.
 */

export type LayoutEntityGroupKey = "opportunity" | "person" | "child" | "child_inquiry";

export interface LayoutCatalogField {
    entityKey: LayoutEntityGroupKey;
    entityLabel: string;
    fieldKey: string;
    fieldLabel: string;
    fieldType: string;
    /** Namespaced source ref used as the layout item refKey. */
    refKey: string;
}

export interface LayoutCatalogGroup {
    entityKey: LayoutEntityGroupKey;
    entityLabel: string;
    fields: LayoutCatalogField[];
}

export interface LayoutCatalogWidget {
    widgetKey: string;
    label: string;
    defaultDisplayMode?: string;
}

export interface LayoutFieldCatalog {
    groups: LayoutCatalogGroup[];
    widgets: LayoutCatalogWidget[];
}

/** The only entity groups exposed in V1, in display order. */
export const LAYOUT_ENTITY_GROUPS: { entityKey: LayoutEntityGroupKey; entityLabel: string }[] = [
    { entityKey: "opportunity", entityLabel: "Lead / Opportunity" },
    { entityKey: "person", entityLabel: "Person / Contact" },
    { entityKey: "child", entityLabel: "Child" },
    { entityKey: "child_inquiry", entityLabel: "Children Inquiry" },
];

/** V1 widget options (render as widget_placeholder; selectable + placeable). */
export const LAYOUT_WIDGET_CATALOG: LayoutCatalogWidget[] = [
    { widgetKey: "tasks", label: "Tasks", defaultDisplayMode: "list" },
    { widgetKey: "reminders", label: "Reminders", defaultDisplayMode: "list" },
    { widgetKey: "actions", label: "Actions", defaultDisplayMode: "buttons" },
    { widgetKey: "tour_summary", label: "Tour summary / follow-up", defaultDisplayMode: "summary" },
    { widgetKey: "recent_communication", label: "Recent communication", defaultDisplayMode: "feed" },
    { widgetKey: "notes", label: "Notes", defaultDisplayMode: "list" },
    { widgetKey: "children_list", label: "Children list / inquiry", defaultDisplayMode: "list" },
];

export function makeRefKey(entityKey: LayoutEntityGroupKey, fieldKey: string): string {
    return `${entityKey}.${fieldKey}`;
}

/** Split a namespaced refKey into { entityKey, fieldKey }. Bare keys → opportunity. */
export function parseRefKey(refKey: string): { entityKey: string; fieldKey: string } {
    const dot = refKey.indexOf(".");
    if (dot === -1) return { entityKey: "opportunity", fieldKey: refKey };
    return { entityKey: refKey.slice(0, dot), fieldKey: refKey.slice(dot + 1) };
}

const ENTITY_LABEL: Record<LayoutEntityGroupKey, string> = {
    opportunity: "Lead / Opportunity",
    person: "Person / Contact",
    child: "Child",
    child_inquiry: "Children Inquiry",
};

function field(
    entityKey: LayoutEntityGroupKey,
    fieldKey: string,
    fieldLabel: string,
    fieldType: string,
): LayoutCatalogField {
    return {
        entityKey,
        entityLabel: ENTITY_LABEL[entityKey],
        fieldKey,
        fieldLabel,
        fieldType,
        refKey: makeRefKey(entityKey, fieldKey),
    };
}

/**
 * Curated fallback fields per group, used when no field_definitions source is
 * available (child / children-inquiry have no clean field-def surface today,
 * and opportunity/person fall back to these if the org has no field defs).
 */
export const CURATED_FIELDS: Record<LayoutEntityGroupKey, LayoutCatalogField[]> = {
    opportunity: [
        field("opportunity", "status_key", "Status", "status"),
        field("opportunity", "source", "Source", "text"),
        field("opportunity", "channel", "Channel", "text"),
        field("opportunity", "campaign", "Campaign", "text"),
        field("opportunity", "tour_status", "Tour status", "status"),
        field("opportunity", "tour_date", "Tour date", "date"),
        field("opportunity", "job_date", "Requested date", "date"),
        field("opportunity", "customer_notes", "Notes", "text"),
    ],
    person: [
        field("person", "primary_contact_name", "Primary contact name", "text"),
        field("person", "primary_phone", "Phone", "phone"),
        field("person", "primary_email", "Email", "text"),
        field("person", "secondary_contact_name", "Secondary contact name", "text"),
        field("person", "secondary_phone", "Secondary phone", "phone"),
    ],
    child: [
        field("child", "name", "Child name", "text"),
        field("child", "program", "Program", "text"),
        field("child", "desired_start_date", "Desired start date", "date"),
        field("child", "status", "Status", "status"),
        field("child", "age_band", "Age band", "text"),
    ],
    child_inquiry: [
        field("child_inquiry", "child_name", "Child name", "text"),
        field("child_inquiry", "program", "Program", "text"),
        field("child_inquiry", "desired_start_date", "Desired start date", "date"),
        field("child_inquiry", "status", "Status", "status"),
    ],
};

/** Map a DB field_definitions row into a normalized catalog field for a group. */
export function fieldDefToCatalog(
    entityKey: LayoutEntityGroupKey,
    row: { field_key: string; label?: string | null; field_type?: string | null },
): LayoutCatalogField {
    return field(
        entityKey,
        row.field_key,
        (row.label ?? row.field_key).trim() || row.field_key,
        (row.field_type ?? "text") || "text",
    );
}
