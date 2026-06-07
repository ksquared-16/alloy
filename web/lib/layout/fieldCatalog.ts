/**
 * Layout V2 — Field & Widget Catalog (Layout Builder V1).
 *
 * Normalizes fields from several sources into a single shape the builder's
 * field picker can use, restricted to the V1 entity groups (Lead/Opportunity,
 * Person/Contact, Child, Enrollment participation). Layout entity_type stays
 * `opportunities`; fields reference related entities via NAMESPACED refKeys
 * (e.g. `opportunity.status_key`, `person.phone`, `child.first_name`,
 * `inquiry_child.desired_start_date`).
 *
 * Canonical namespaces (FC-1): child.*, inquiry_child.*, person.*, opportunity.*
 * Deprecated: child_inquiry.* (alias-on-read via layoutRefKeyAliases).
 *
 * Normalized field entry:
 *   { entityKey, entityLabel, fieldKey, fieldLabel, fieldType, refKey }
 */

import { INQUIRY_CHILD_NATIVE_FIELD_MANIFEST } from "@/lib/fields/inquiryChildFieldRegistry";
import { parseLayoutRefKey } from "./layoutRefKeyAliases";

/** Canonical layout catalog entity groups (FC-1). */
export type LayoutEntityGroupKey = "opportunity" | "person" | "child" | "inquiry_child";

export interface LayoutCatalogField {
    entityKey: LayoutEntityGroupKey;
    entityLabel: string;
    fieldKey: string;
    fieldLabel: string;
    fieldType: string;
    /** Namespaced source ref used as the layout item refKey (canonical namespace). */
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
    { entityKey: "inquiry_child", entityLabel: "Children Inquiry" },
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

/** Split a namespaced refKey into { entityKey, fieldKey }. Bare keys → opportunity. Applies alias-on-read. */
export function parseRefKey(refKey: string): { entityKey: string; fieldKey: string } {
    const parsed = parseLayoutRefKey(refKey);
    return { entityKey: parsed.entityKey, fieldKey: parsed.fieldKey };
}

const ENTITY_LABEL: Record<LayoutEntityGroupKey, string> = {
    opportunity: "Lead / Opportunity",
    person: "Person / Contact",
    child: "Child",
    inquiry_child: "Children Inquiry",
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
 * Bootstrap fallback fields per group when field_definitions has no rows.
 * Shrunk in FC-1: inquiry_child uses manifest; child uses durable-only keys;
 * person/opportunity use canonical refKeys (not legacy primary_* where mapped).
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
        field("person", "phone", "Phone", "phone"),
        field("person", "email", "Email", "text"),
        field("person", "secondary_contact_name", "Secondary contact name", "text"),
        field("person", "secondary_phone", "Secondary phone", "phone"),
    ],
    /**
     * Durable child attributes only. Interim catalog bridge: rows may load from
     * person entity_type in field_definitions — person ≠ child; durable truth
     * remains customer_member per Child Model doctrine.
     */
    child: [
        field("child", "first_name", "First name", "text"),
        field("child", "last_name", "Last name", "text"),
        field("child", "name", "Child name", "text"),
        field("child", "date_of_birth", "Date of birth", "date"),
        field("child", "age_band", "Age band", "text"),
    ],
    inquiry_child: INQUIRY_CHILD_NATIVE_FIELD_MANIFEST.map((row) =>
        field("inquiry_child", row.field_key, row.label, row.field_type),
    ),
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

/** Merge registry rows with curated fallback for keys missing from parity (narrow fallback). */
export function mergeCatalogWithCuratedFallback(
    group: LayoutEntityGroupKey,
    registryFields: LayoutCatalogField[],
): LayoutCatalogField[] {
    if (registryFields.length === 0) return CURATED_FIELDS[group];
    const byKey = new Map(registryFields.map((f) => [f.fieldKey, f]));
    for (const curated of CURATED_FIELDS[group]) {
        if (!byKey.has(curated.fieldKey)) byKey.set(curated.fieldKey, curated);
    }
    return [...byKey.values()].sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
}
