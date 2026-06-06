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
const CALENDAR_ICON: LayoutFieldAdornment = { position: "left", icon: "calendar" };
const HOME_ICON: LayoutFieldAdornment = { position: "left", icon: "home" };
const LOCATION_ICON: LayoutFieldAdornment = { position: "left", icon: "location" };
const PHONE_ICON: LayoutFieldAdornment = { position: "left", icon: "phone" };

/** Display-text (computed) item: static text + {token} replacement. */
function templateItem(base: string, key: string, template: string, label: string, adornment?: LayoutFieldAdornment): LayoutItem {
    const item: LayoutItem = { id: id(base, "t", key), kind: "field", refKey: "_template", label, renderHint: "text", template };
    if (adornment) item.adornment = adornment;
    return item;
}

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
    // Contact block: a controlled subgrid (column-in-column) — row1 full name,
    // row2 email | phone (2 columns) — inside the left column.
    const cbBase = id(sumBase, "r0c0", "contact");
    const contactBlock: LayoutItem = {
        id: id(cbBase, "group"),
        kind: "field_group",
        refKey: "contact_block",
        label: "Contact",
        rows: [
            row(id(cbBase, "r0"), [col(id(cbBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [fieldItem(id(cbBase, "r0c0"), "person.primary_contact_name", "Full name", "text", undefined, PERSON_LINK)])]),
            row(id(cbBase, "r1"), [
                col(id(cbBase, "r1"), 0, HALF, [fieldItem(id(cbBase, "r1c0"), "person.primary_email", "Email", "text")]),
                col(id(cbBase, "r1"), 1, HALF, [fieldItem(id(cbBase, "r1c1"), "person.primary_phone", "Phone", "phone")]),
            ]),
        ],
    };
    const leadSummary = section(
        "lead_summary",
        "Lead Summary",
        [
            row(id(sumBase, "r0"), [
                col(id(sumBase, "r0"), 0, HALF, [
                    contactBlock,
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

/**
 * Lead queue card default — mirrors the work-unit record card:
 *   left (main, flexible width): house icon + "{last_name} Household" title,
 *   status pill, attention/urgent line (conditional), location label row,
 *   contact row, and a children related-list (each child renders as its own row).
 *   right (action stack): Open / Message / Update Status / Ask BOS.
 *
 * Uses computed display text for the household title, pill display for status,
 * the location LABEL (not location.id), and an icon adornment incl. the house.
 */
export function buildLeadQueueDefaultDoc(): LayoutDoc {
    const base = id("opportunities", "lead", "queue_card");
    const LEFT = 9;
    const RIGHT = LAYOUT_GRID_COLUMNS - LEFT; // 3

    // Children related-list: each child is its own row (compact columns).
    const childrenRows: LayoutItem = {
        id: id(base, "children"),
        kind: "related_list",
        refKey: "children",
        label: "Children",
        source: "children",
        displayMode: "rows",
        related: { entityType: "child" },
        columns: [
            { label: "Child", refKey: "child.name", width: "flexible", adornment: { position: "left", icon: "child", action: { type: "open_drawer", entity: "child", idPath: "child.id" } } },
            { label: "Program", refKey: "child.program", width: "medium" },
            { label: "Status", refKey: "child.status", width: "small", renderHint: "badge" },
        ],
    };

    const leftItems: LayoutItem[] = [
        // Household title (computed display text) + house icon.
        templateItem(base, "title", "{last_name} Household", "Household", HOME_ICON),
        // Status as a pill/badge.
        fieldItem(id(base, "status"), "opportunity.status_key", "Status", "status"),
        // Attention / urgent line — only when present.
        templateItem(base, "attn", "{_attention}", "Attention", undefined),
        // Location LABEL (not id) with a location icon.
        fieldItem(id(base, "loc"), "opportunity.location", "Location", "text", undefined, LOCATION_ICON),
        // Contact row: name + phone.
        fieldItem(id(base, "contact"), "person.primary_contact_name", "Contact", "text", undefined, PERSON_LINK),
        fieldItem(id(base, "phone"), "person.primary_phone", "Phone", "phone", undefined, PHONE_ICON),
        // Children rows.
        childrenRows,
    ];
    // Tag the attention item with a visibility condition (renders only if present).
    leftItems[2].visibleWhen = { type: "exists", path: "_attention" };

    const actionStack: LayoutItem = widgetItem(id(base, "actions"), "actions", "Actions", "buttons");
    // Card action stack labels (presentation hint consumed by the renderer).
    actionStack.metadata = { actions: ["Open", "Message", "Update Status", "Ask BOS"], layout: "stack" };

    const card = section(
        "lead_card",
        "Lead card",
        [
            row(id(base, "r0"), [
                col(id(base, "r0"), 0, LEFT, leftItems),
                col(id(base, "r0"), 1, RIGHT, [actionStack]),
            ]),
        ],
        { defaultExpanded: true },
    );

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
