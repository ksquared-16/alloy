/**
 * Layout V2 — curated default Person drawer (relationship workspace v2).
 *
 * Mirrors Lead drawer anatomy without Lead-specific sections. Section keys and
 * presentation metadata drive PersonOverviewRuntimeComposition + summary strip.
 */

import {
    LAYOUT_DOC_FORMAT_VERSION,
    LAYOUT_GRID_COLUMNS,
    type LayoutDoc,
    type LayoutFieldAdornment,
    type LayoutItem,
    type LayoutRenderHint,
    type LayoutRow,
    type LayoutSection,
} from "./layoutV2";
import { parseRefKey } from "./fieldCatalog";
import {
    COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY,
    PERSON_OVERVIEW_CONNECTED_CHILDREN_MAX_VISIBLE_ROWS,
} from "@/lib/layout/runtime/personOverviewComposition";
import {
    LAYOUT_SECTION_COLLAPSE_WHEN_EMPTY_METADATA_KEY,
    LAYOUT_SECTION_PRIORITY_METADATA_KEY,
    LAYOUT_SECTION_RAIL_SLOT_METADATA_KEY,
    LAYOUT_SECTION_SHOW_WHEN_EMPTY_METADATA_KEY,
} from "@/lib/layout/runtime/layoutSectionPresentationMetadata";

// `open_drawer` is RETIRED. The platform defaults are ours, so they stop teaching a value no
// runtime executes: the icon stays, the inert action does not. Tenant-authored layouts are NOT
// rewritten — the stored value carries an entity + idPath, and the canonical replacement is an
// ASPECT on a host record's panel whose host comes from that record's own work_unit_id at runtime.
// A migration would have to guess, so the parser keeps accepting it and nothing executes it.
const PERSON_LINK: LayoutFieldAdornment = {
    position: "left",
    icon: "person"
};
const CHILD_LINK: LayoutFieldAdornment = {
    position: "left",
    icon: "child"
};
const HOME_ICON: LayoutFieldAdornment = { position: "left", icon: "home" };
const PHONE_ICON: LayoutFieldAdornment = { position: "left", icon: "phone" };
const MAIL_ICON: LayoutFieldAdornment = { position: "left", icon: "mail" };

const HALF = LAYOUT_GRID_COLUMNS / 2;
const THIRD = LAYOUT_GRID_COLUMNS / 3;

function id(...parts: string[]): string {
    return parts.join("-");
}

function fieldItem(
    base: string,
    refKey: string,
    label: string,
    renderHint: LayoutRenderHint = "text",
    adornment?: LayoutFieldAdornment,
    editable = true,
): LayoutItem {
    return {
        id: id(base, "f", refKey.replace(/\./g, "_")),
        kind: "field",
        refKey,
        label,
        renderHint,
        editable,
        sourceEntity: parseRefKey(refKey).entityKey,
        ...(adornment ? { adornment } : {}),
    };
}

function widgetItem(base: string, widgetKey: string, label: string, displayMode?: string): LayoutItem {
    return {
        id: id(base, "w", widgetKey),
        kind: "widget_placeholder",
        refKey: widgetKey,
        label,
        widget: { widgetKey: `person.${widgetKey}`, displayMode, note: `${label} widget` },
    };
}

function col(base: string, idx: number, width: number, items: LayoutItem[]) {
    return { id: id(base, `c${idx}`), width, items };
}

function row(base: string, columns: ReturnType<typeof col>[]): LayoutRow {
    return { id: base, columns };
}

function section(
    sKey: string,
    title: string,
    rows: LayoutRow[],
    opts?: { defaultExpanded?: boolean; metadata?: Record<string, unknown> },
): LayoutSection {
    return {
        id: id("person", "drawer", sKey),
        key: sKey,
        title,
        collapsible: true,
        defaultExpanded: opts?.defaultExpanded ?? false,
        rows,
        ...(opts?.metadata ? { metadata: opts.metadata } : {}),
    };
}

function railSectionMetadata(priority: number): Record<string, unknown> {
    return {
        [LAYOUT_SECTION_PRIORITY_METADATA_KEY]: priority,
        [LAYOUT_SECTION_RAIL_SLOT_METADATA_KEY]: "right_rail",
        [LAYOUT_SECTION_COLLAPSE_WHEN_EMPTY_METADATA_KEY]: true,
        [LAYOUT_SECTION_SHOW_WHEN_EMPTY_METADATA_KEY]: false,
    };
}

/** Person drawer default — relationship workspace (Patch 19). */
export function buildPersonDrawerDefaultDoc(): LayoutDoc {
    const sumBase = id("person", "drawer", "person_summary");
    const personSummary = section(
        "person_summary",
        "Person Summary",
        [
            row(id(sumBase, "r0"), [
                col(id(sumBase, "r0"), 0, THIRD, [widgetItem(id(sumBase, "r0c0"), "household_summary", "Household", "summary")]),
                col(id(sumBase, "r0"), 1, THIRD, [widgetItem(id(sumBase, "r0c1"), "connected_children", "Children", "list")]),
                col(id(sumBase, "r0"), 2, THIRD, [widgetItem(id(sumBase, "r0c2"), "last_touch", "Last Touch", "summary")]),
                col(id(sumBase, "r0"), 3, THIRD, [widgetItem(id(sumBase, "r0c3"), "tasks", "Open Work", "list")]),
            ]),
        ],
        { defaultExpanded: true },
    );

    const hhBase = id("person", "drawer", "household_relationships");
    const householdRelationships = section(
        "household_relationships",
        "Household",
        [
            row(id(hhBase, "r0"), [
                col(id(hhBase, "r0"), 0, HALF, [
                    fieldItem(hhBase, "customer.household_name", "Household", "text", HOME_ICON, false),
                    fieldItem(hhBase, "person.relationship", "Role / relationship", "text", undefined, false),
                ]),
                col(id(hhBase, "r0"), 1, HALF, [
                    fieldItem(hhBase, "location.household_address", "Household address", "text", HOME_ICON, false),
                ]),
            ]),
            row(id(hhBase, "r1"), [
                col(id(hhBase, "r1"), 0, LAYOUT_GRID_COLUMNS, [
                    widgetItem(id(hhBase, "r1c0"), "related_people", "Related people", "list"),
                ]),
            ]),
        ],
        { defaultExpanded: true },
    );

    const ccBase = id("person", "drawer", "connected_children");
    const connectedChildrenTable: LayoutItem = {
        id: id(ccBase, "children_table"),
        kind: "related_list",
        refKey: "household_children",
        label: "Connected children",
        source: "household_children",
        displayMode: "table",
        related: { entityType: "customer_members", filterKey: "household" },
        columns: [
            {
                label: "Child",
                refKey: "child.name",
                width: "medium",
                adornment: { position: "left", icon: "child" },
            },
            { label: "Date of birth", refKey: "child.date_of_birth", width: "medium", renderHint: "date" },
            { label: "Age", refKey: "child.age_band", width: "medium" },
            { label: "Program", refKey: "child.program", width: "medium" },
            { label: "Status", refKey: "child.status", width: "medium", renderHint: "status" },
        ],
        metadata: {
            [COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY]: [
                "child.name",
                "child.date_of_birth",
                "child.age_band",
                "child.program",
                "child.status",
            ],
        },
    };
    const connectedChildren = section(
        "connected_children",
        "Connected Children",
        [row(id(ccBase, "r0"), [col(id(ccBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [connectedChildrenTable])])],
        { defaultExpanded: true },
    );

    const ciBase = id("person", "drawer", "contact_information");
    const contactInformation = section(
        "contact_information",
        "Contact Information",
        [
            row(id(ciBase, "r0"), [
                col(id(ciBase, "r0"), 0, HALF, [
                    fieldItem(ciBase, "person.primary_contact_name", "Full name", "text", PERSON_LINK, false),
                    fieldItem(ciBase, "person.primary_phone", "Phone", "phone", PHONE_ICON),
                ]),
                col(id(ciBase, "r0"), 1, HALF, [
                    fieldItem(ciBase, "person.primary_email", "Email", "text", MAIL_ICON),
                ]),
            ]),
        ],
        { defaultExpanded: true },
    );

    const ncBase = id("person", "drawer", "notes_communication");
    const notesComm = section(
        "notes_communication",
        "Notes / Recent Communication",
        [
            row(id(ncBase, "r0"), [col(id(ncBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [widgetItem(id(ncBase, "r0c0"), "notes", "Notes", "list")])]),
            row(id(ncBase, "r1"), [
                col(id(ncBase, "r1"), 0, LAYOUT_GRID_COLUMNS, [widgetItem(id(ncBase, "r1c0"), "recent_communication", "Recent communication", "feed")]),
            ]),
        ],
        { metadata: railSectionMetadata(20) },
    );

    const actBase = id("person", "drawer", "recent_activity");
    const recentActivity = section(
        "recent_activity",
        "Recent Activity",
        [
            row(id(actBase, "r0"), [col(id(actBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [widgetItem(id(actBase, "r0c0"), "activity", "Activity", "feed")])]),
        ],
        { metadata: railSectionMetadata(30) },
    );

    const docBase = id("person", "drawer", "documents");
    const documents = section(
        "documents",
        "Documents",
        [
            row(id(docBase, "r0"), [col(id(docBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [widgetItem(id(docBase, "r0c0"), "documents", "Documents", "list")])]),
        ],
        {
            metadata: {
                ...railSectionMetadata(10),
                [LAYOUT_SECTION_COLLAPSE_WHEN_EMPTY_METADATA_KEY]: true,
                [LAYOUT_SECTION_SHOW_WHEN_EMPTY_METADATA_KEY]: false,
            },
        },
    );

    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "drawer",
        entityType: "person",
        sections: [
            personSummary,
            householdRelationships,
            connectedChildren,
            contactInformation,
            notesComm,
            recentActivity,
            documents,
        ],
        metadata: { seededFrom: "person_default", template: "person_drawer_v2" },
    };
}
