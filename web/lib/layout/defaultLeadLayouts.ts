/**
 * Layout V2 — curated default Lead layouts (Layout Builder V1).
 *
 * Replaces the generic registry/runtime seed for opportunities with a default
 * that resembles the real Lead drawer and the work-unit Lead queue card. Uses
 * namespaced field refs (opportunity.*, person.*, child.*) and widget
 * placeholders. Deterministic ids so output is stable.
 *
 * Fields may not all hydrate yet (related person/child); the proof renderer
 * shows placeholders, but the intended source ref is preserved.
 */

import {
    LAYOUT_DOC_FORMAT_VERSION,
    LAYOUT_GRID_COLUMNS,
    type LayoutCondition,
    type LayoutDoc,
    type LayoutFieldAdornment,
    type LayoutItem,
    type LayoutRenderHint,
    type LayoutRow,
    type LayoutSection,
    type LayoutSurface,
} from "./layoutV2";
import { parseRefKey } from "./fieldCatalog";

const PERSON_LINK: LayoutFieldAdornment = { position: "left", icon: "person", action: { type: "open_drawer", entity: "person", idPath: "opportunity.primary_person_id" } };
const CHILD_LINK: LayoutFieldAdornment = { position: "left", icon: "child", action: { type: "open_drawer", entity: "child" } };
const CALENDAR_ICON: LayoutFieldAdornment = { position: "left", icon: "calendar" };

function id(...parts: string[]): string {
    return parts.join("-");
}

function fieldItem(
    base: string,
    refKey: string,
    label: string,
    renderHint: LayoutRenderHint = "text",
    visibleWhen?: LayoutCondition,
    adornment?: LayoutFieldAdornment,
): LayoutItem {
    const item: LayoutItem = {
        id: id(base, "f", refKey.replace(/\./g, "_")),
        kind: "field",
        refKey,
        label,
        renderHint,
        editable: true,
        sourceEntity: parseRefKey(refKey).entityKey,
    };
    if (visibleWhen) item.visibleWhen = visibleWhen;
    if (adornment) item.adornment = adornment;
    return item;
}

function widgetItem(base: string, widgetKey: string, label: string, displayMode?: string): LayoutItem {
    return {
        id: id(base, "w", widgetKey),
        kind: "widget_placeholder",
        refKey: widgetKey,
        label,
        widget: { widgetKey: `opportunities.${widgetKey}`, displayMode, note: `${label} widget` },
    };
}

const HALF = LAYOUT_GRID_COLUMNS / 2; // 6
const THIRD = LAYOUT_GRID_COLUMNS / 3; // 4

function col(base: string, idx: number, width: number, items: LayoutItem[]) {
    return { id: id(base, `c${idx}`), width, items };
}
function row(base: string, columns: ReturnType<typeof col>[], visibleWhen?: LayoutCondition): LayoutRow {
    const r: LayoutRow = { id: base, columns };
    if (visibleWhen) r.visibleWhen = visibleWhen;
    return r;
}

function section(
    sKey: string,
    title: string,
    rows: LayoutRow[],
    opts?: { defaultExpanded?: boolean },
): LayoutSection {
    return {
        id: id("opportunities", "lead", sKey),
        key: sKey,
        title,
        collapsible: true,
        defaultExpanded: opts?.defaultExpanded ?? false,
        rows,
    };
}

/** Lead drawer default: Lead Summary, Children Inquiry, Lead Source, Notes/Communication. */
export function buildLeadDrawerDefaultDoc(): LayoutDoc {
    // 1. Lead Summary — 2 columns: contacts/tour | tasks/reminders/actions
    const sumBase = id("opportunities", "lead", "lead_summary");
    const leadSummary = section(
        "lead_summary",
        "Lead Summary",
        [
            row(id(sumBase, "r0"), [
                col(id(sumBase, "r0"), 0, HALF, [
                    fieldItem(id(sumBase, "r0c0"), "person.primary_contact_name", "Primary contact", "text", undefined, PERSON_LINK),
                    fieldItem(id(sumBase, "r0c0"), "person.primary_phone", "Phone", "phone"),
                    fieldItem(id(sumBase, "r0c0"), "person.primary_email", "Email", "text"),
                    fieldItem(
                        id(sumBase, "r0c0"),
                        "person.secondary_contact_name",
                        "Secondary contact",
                        "text",
                        { type: "exists", path: "person.secondary_contact_name" },
                        PERSON_LINK,
                    ),
                    fieldItem(id(sumBase, "r0c0"), "opportunity.tour_date", "Tour date", "date", undefined, CALENDAR_ICON),
                    fieldItem(id(sumBase, "r0c0"), "opportunity.tour_status", "Tour status", "status"),
                ]),
                col(id(sumBase, "r0"), 1, HALF, [
                    widgetItem(id(sumBase, "r0c1"), "tasks", "Tasks"),
                    widgetItem(id(sumBase, "r0c1"), "reminders", "Reminders"),
                    widgetItem(id(sumBase, "r0c1"), "actions", "Actions", "buttons"),
                ]),
            ]),
        ],
        { defaultExpanded: true },
    );

    // 2. Lead Children — related-list TABLE (rows = children, columns = fields)
    const ciBase = id("opportunities", "lead", "children_inquiry");
    const childrenTable: LayoutItem = {
        id: id(ciBase, "children_table"),
        kind: "related_list",
        refKey: "children",
        label: "Lead children",
        source: "children",
        displayMode: "table",
        related: { entityType: "child" },
        columns: [
            { label: "Child", refKey: "child.name", width: "medium", adornment: { position: "left", icon: "child", action: { type: "open_drawer", entity: "child", idPath: "child.id" } } },
            { label: "DOB / Age", refKey: "child.dob_age", width: "medium" },
            { label: "Desired Start", refKey: "child.desired_start_date", width: "medium", renderHint: "date" },
            { label: "Location", refKey: "child.location", width: "medium" },
            { label: "Program", refKey: "child.program", width: "medium" },
            { label: "Room", refKey: "child.room", width: "medium" },
            { label: "Schedule", refKey: "child.schedule", width: "medium" },
            { label: "Status", refKey: "child.status", width: "medium", renderHint: "status" },
        ],
    };
    const childrenInquiry = section(
        "children_inquiry",
        "Lead Children",
        [row(id(ciBase, "r0"), [col(id(ciBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [childrenTable])])],
        { defaultExpanded: true },
    );

    // 3. Lead Source — 3 columns
    const lsBase = id("opportunities", "lead", "lead_source");
    const leadSource = section("lead_source", "Lead Source", [
        row(id(lsBase, "r0"), [
            col(id(lsBase, "r0"), 0, THIRD, [fieldItem(id(lsBase, "r0c0"), "opportunity.source", "Source", "text")]),
            col(id(lsBase, "r0"), 1, THIRD, [fieldItem(id(lsBase, "r0c1"), "opportunity.channel", "Channel", "text")]),
            col(id(lsBase, "r0"), 2, THIRD, [fieldItem(id(lsBase, "r0c2"), "opportunity.campaign", "Campaign", "text")]),
        ]),
    ]);

    // 4. Notes / Recent Communication — widgets
    const ncBase = id("opportunities", "lead", "notes_comm");
    const notesComm = section("notes_communication", "Notes / Recent Communication", [
        row(id(ncBase, "r0"), [col(id(ncBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [widgetItem(id(ncBase, "r0c0"), "recent_communication", "Recent communication", "feed")])]),
        row(id(ncBase, "r1"), [col(id(ncBase, "r1"), 0, LAYOUT_GRID_COLUMNS, [widgetItem(id(ncBase, "r1c0"), "notes", "Notes", "list")])]),
    ]);

    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "drawer",
        entityType: "opportunities",
        sections: [leadSummary, childrenInquiry, leadSource, notesComm],
        metadata: { seededFrom: "lead_default", template: "lead_drawer_v1" },
    };
}

/** Lead queue card default: resembles the work-unit Lead queue record (a card, not a table). */
export function buildLeadQueueDefaultDoc(): LayoutDoc {
    const base = id("opportunities", "lead", "queue_card");
    const card = section("lead_card", "Lead card", [
        row(id(base, "r0"), [
            col(id(base, "r0"), 0, HALF, [fieldItem(id(base, "r0c0"), "person.primary_contact_name", "Contact", "text", undefined, PERSON_LINK)]),
            col(id(base, "r0"), 1, HALF, [fieldItem(id(base, "r0c1"), "opportunity.status_key", "Status", "status")]),
        ]),
        row(id(base, "r1"), [
            col(id(base, "r1"), 0, HALF, [fieldItem(id(base, "r1c0"), "opportunity.tour_date", "Tour / next action", "date")]),
            col(id(base, "r1"), 1, HALF, [fieldItem(id(base, "r1c1"), "child.desired_start_date", "Desired start", "date")]),
        ]),
        row(id(base, "r2"), [
            col(id(base, "r2"), 0, HALF, [fieldItem(id(base, "r2c0"), "child.name", "Child", "text", undefined, CHILD_LINK)]),
            col(id(base, "r2"), 1, HALF, [fieldItem(id(base, "r2c1"), "child.program", "Program", "text")]),
        ]),
        row(id(base, "r3"), [
            col(id(base, "r3"), 0, HALF, [widgetItem(id(base, "r3c0"), "tasks", "Tasks / attention")]),
            col(id(base, "r3"), 1, HALF, [widgetItem(id(base, "r3c1"), "recent_communication", "Last activity", "feed")]),
        ]),
    ], { defaultExpanded: true });

    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "queue",
        entityType: "opportunities",
        sections: [card],
        metadata: { seededFrom: "lead_default", template: "lead_queue_card_v1", renderAs: "card" },
    };
}

/** Curated Lead default for opportunities; null for other entities (caller falls back). */
export function buildLeadDefaultDoc(entityType: string, surface: LayoutSurface): LayoutDoc | null {
    if (entityType !== "opportunities") return null;
    return surface === "queue" ? buildLeadQueueDefaultDoc() : buildLeadDrawerDefaultDoc();
}
