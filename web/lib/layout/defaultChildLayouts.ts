/**
 * Layout V2 — curated default Child drawer (enrollment/care workspace v2).
 *
 * Mirrors Lead/Person operating-surface doctrine. Section keys drive
 * ChildOverviewRuntimeComposition + summary strip.
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
    CHILD_OVERVIEW_FAMILY_MAX_VISIBLE_ROWS,
} from "@/lib/layout/runtime/childOverviewComposition";
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
const CHILD_LINK: LayoutFieldAdornment = {
    position: "left",
    icon: "child"
};
const PERSON_LINK: LayoutFieldAdornment = {
    position: "left",
    icon: "person"
};
const HOME_ICON: LayoutFieldAdornment = { position: "left", icon: "home" };
const CALENDAR_ICON: LayoutFieldAdornment = { position: "left", icon: "calendar" };

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
        widget: { widgetKey: `child.${widgetKey}`, displayMode, note: `${label} widget` },
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
        id: id("child", "drawer", sKey),
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

/** Child drawer default — enrollment/care workspace (Patch 20). */
export function buildChildDrawerDefaultDoc(): LayoutDoc {
    const sumBase = id("child", "drawer", "child_summary");
    const childSummary = section(
        "child_summary",
        "Child Summary",
        [
            row(id(sumBase, "r0"), [
                col(id(sumBase, "r0"), 0, THIRD, [widgetItem(id(sumBase, "r0c0"), "program_enrollment", "Program", "summary")]),
                col(id(sumBase, "r0"), 1, THIRD, [widgetItem(id(sumBase, "r0c1"), "family", "Family", "summary")]),
                col(id(sumBase, "r0"), 2, THIRD, [widgetItem(id(sumBase, "r0c2"), "documents_requirements", "Documents", "summary")]),
                col(id(sumBase, "r0"), 3, THIRD, [widgetItem(id(sumBase, "r0c3"), "last_touch", "Last Touch", "summary")]),
            ]),
        ],
        { defaultExpanded: true },
    );

    const peBase = id("child", "drawer", "program_enrollment");
    const programEnrollment = section(
        "program_enrollment",
        "Program & Enrollment",
        [
            row(id(peBase, "identity"), [
                col(id(peBase, "identity"), 0, HALF, [
                    fieldItem(peBase, "child.first_name", "First name", "text", CHILD_LINK),
                    fieldItem(peBase, "child.last_name", "Last name", "text"),
                    fieldItem(peBase, "child.date_of_birth", "Date of birth", "date", CALENDAR_ICON),
                ]),
                col(id(peBase, "identity"), 1, HALF, [
                    fieldItem(peBase, "child.age_band", "Age", "text", undefined, false),
                ]),
            ]),
            row(id(peBase, "r0"), [
                col(id(peBase, "r0"), 0, HALF, [
                    fieldItem(peBase, "inquiry_child.program", "Program", "text", undefined, false),
                    fieldItem(peBase, "inquiry_child.program_category_id", "Program", "text"),
                    fieldItem(peBase, "inquiry_child.program_room_cohort_key", "Classroom / cohort", "text"),
                ]),
                col(id(peBase, "r0"), 1, HALF, [
                    fieldItem(peBase, "inquiry_child.start_date", "Desired start", "date", CALENDAR_ICON),
                    fieldItem(peBase, "inquiry_child.schedule_type", "Schedule", "text"),
                    fieldItem(peBase, "inquiry_child.outcome_status_key", "Enrollment status", "status"),
                    fieldItem(peBase, "child.status", "Child status", "status", undefined, false),
                ]),
            ]),
            row(id(peBase, "r1"), [
                col(id(peBase, "r1"), 0, HALF, [
                    fieldItem(peBase, "inquiry_child.location_id", "Site / location", "text", HOME_ICON),
                ]),
            ]),
        ],
        { defaultExpanded: true },
    );

    const frBase = id("child", "drawer", "family_relationships");
    const familyTable: LayoutItem = {
        id: id(frBase, "family_table"),
        kind: "related_list",
        refKey: "family_adults",
        label: "Family / adults",
        source: "family_adults",
        displayMode: "table",
        related: { entityType: "persons", filterKey: "household" },
        columns: [
            {
                label: "Name",
                refKey: "person.primary_contact_name",
                width: "medium",
                adornment: { position: "left", icon: "person" },
            },
            { label: "Role", refKey: "person.household_role", width: "medium" },
            { label: "Phone", refKey: "person.primary_phone", width: "medium", renderHint: "phone" },
            { label: "Email", refKey: "person.primary_email", width: "medium" },
        ],
        metadata: {
            [COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY]: [
                "person.primary_contact_name",
                "person.household_role",
                "person.primary_phone",
            ],
        },
    };
    const familyRelationships = section(
        "family_relationships",
        "Family",
        [
            row(id(frBase, "r0"), [
                col(id(frBase, "r0"), 0, HALF, [
                    fieldItem(frBase, "customer.household_name", "Household", "text", HOME_ICON, false),
                ]),
            ]),
            row(id(frBase, "r1"), [col(id(frBase, "r1"), 0, LAYOUT_GRID_COLUMNS, [familyTable])]),
        ],
        { defaultExpanded: true },
    );

    const saBase = id("child", "drawer", "schedule_attendance");
    const scheduleAttendance = section(
        "schedule_attendance",
        "Enrollment & schedule",
        [
            row(id(saBase, "r0"), [
                col(id(saBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [
                    {
                        id: id(saBase, "operational_enrollment"),
                        kind: "widget_placeholder",
                        refKey: "operational_enrollment",
                        label: "Operational enrollment",
                        widget: {
                            widgetKey: "child.operational_enrollment",
                            displayMode: "summary",
                        },
                    },
                ]),
            ]),
        ],
        { defaultExpanded: false },
    );

    const ncBase = id("child", "drawer", "notes_communication");
    const notesComm = section(
        "notes_communication",
        "Notes / Communication",
        [
            row(id(ncBase, "r0"), [col(id(ncBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [widgetItem(id(ncBase, "r0c0"), "notes", "Notes", "list")])]),
            row(id(ncBase, "r1"), [
                col(id(ncBase, "r1"), 0, LAYOUT_GRID_COLUMNS, [widgetItem(id(ncBase, "r1c0"), "recent_communication", "Recent communication", "feed")]),
            ]),
        ],
        { metadata: railSectionMetadata(20) },
    );

    const actBase = id("child", "drawer", "recent_activity");
    const recentActivity = section(
        "recent_activity",
        "Recent Activity",
        [
            row(id(actBase, "r0"), [col(id(actBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [widgetItem(id(actBase, "r0c0"), "activity", "Activity", "feed")])]),
        ],
        { metadata: railSectionMetadata(30) },
    );

    const docBase = id("child", "drawer", "documents");
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
        entityType: "child",
        sections: [
            childSummary,
            programEnrollment,
            familyRelationships,
            scheduleAttendance,
            notesComm,
            recentActivity,
            documents,
        ],
        metadata: { seededFrom: "child_default", template: "child_drawer_v2" },
    };
}
