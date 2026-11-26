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

import { defaultLeadQueueLayoutV3, defaultWaitlistQueueLayoutV3 } from "./queueRecordLayoutV3";
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
import {
    COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY,
    DEFAULT_LEAD_ENROLLMENT_COMPOSITION_PRIMARY_COLUMN_REFS,
} from "@/lib/layout/runtime/leadOverviewComposition";
import {
    DEFAULT_LEAD_ENROLLMENT_GRID_CELL_ROLES,
    ENROLLMENT_GRID_CELL_ROLES_METADATA_KEY,
} from "@/lib/layout/runtime/enrollmentGridPresentation";
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
const PERSON_LINK: LayoutFieldAdornment = { position: "left", icon: "person" };
const CHILD_LINK: LayoutFieldAdornment = { position: "left", icon: "child" };
const CALENDAR_ICON: LayoutFieldAdornment = { position: "left", icon: "calendar" };
const HOME_ICON: LayoutFieldAdornment = { position: "left", icon: "home" };
const LOCATION_ICON: LayoutFieldAdornment = { position: "left", icon: "location" };
const PHONE_ICON: LayoutFieldAdornment = { position: "left", icon: "phone" };
const MAIL_ICON: LayoutFieldAdornment = { position: "left", icon: "mail" };

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
    editable?: boolean,
): LayoutItem {
    const item: LayoutItem = {
        id: id(base, "f", refKey.replace(/\./g, "_")),
        kind: "field",
        refKey,
        label,
        renderHint,
        sourceEntity: parseRefKey(refKey).entityKey,
        ...(editable === true ? { editable: true } : {}),
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
    opts?: { defaultExpanded?: boolean; metadata?: Record<string, unknown> },
): LayoutSection {
    return {
        id: id("opportunities", "lead", sKey),
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

/** Lead drawer default — summary strip widgets + Children & Enrollment centerpiece (Patch 5). */
export function buildLeadDrawerDefaultDoc(): LayoutDoc {
    // 1. Lead Summary — operational widget row (routes to shell summary strip when boundary flag on)
    const sumBase = id("opportunities", "lead", "lead_summary");
    const leadSummary = section(
        "lead_summary",
        "Lead Summary",
        [
            row(id(sumBase, "r0"), [
                col(id(sumBase, "r0"), 0, THIRD, [widgetItem(id(sumBase, "r0c0"), "attention", "Attention", "summary")]),
                col(id(sumBase, "r0"), 1, THIRD, [widgetItem(id(sumBase, "r0c1"), "current_work", "Current Work", "summary")]),
                col(id(sumBase, "r0"), 2, THIRD, [widgetItem(id(sumBase, "r0c2"), "tour_summary", "Tour / Event", "summary")]),
                col(id(sumBase, "r0"), 3, THIRD, [widgetItem(id(sumBase, "r0c3"), "children_list", "Children", "list")]),
            ]),
        ],
        { defaultExpanded: true },
    );

    // 2. Children & Enrollment — related-list TABLE (enrollment context per child)
    const ceBase = id("opportunities", "lead", "children_enrollment");
    const childrenEnrollmentTable: LayoutItem = {
        id: id(ceBase, "children_table"),
        kind: "related_list",
        refKey: "children",
        label: "Children & enrollment",
        source: "children",
        displayMode: "table",
        related: { entityType: "child" },
        columns: [
            { label: "Child", refKey: "child.name", width: "medium", adornment: { position: "left", icon: "child" } },
            { label: "DOB / Age", refKey: "child.dob_age", width: "medium" },
            { label: "Program", refKey: "child.program", width: "medium" },
            { label: "Desired start", refKey: "child.start_date", width: "medium", renderHint: "date" },
            { label: "Schedule", refKey: "child.schedule", width: "medium" },
            { label: "Classroom", refKey: "child.room", width: "medium" },
            { label: "Location", refKey: "child.location", width: "medium" },
            { label: "Status", refKey: "child.status", width: "medium", renderHint: "status" },
        ],
        metadata: {
            [COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY]: [
                ...DEFAULT_LEAD_ENROLLMENT_COMPOSITION_PRIMARY_COLUMN_REFS,
            ],
            [ENROLLMENT_GRID_CELL_ROLES_METADATA_KEY]: DEFAULT_LEAD_ENROLLMENT_GRID_CELL_ROLES,
        },
    };
    const childrenEnrollment = section(
        "children_enrollment",
        "Children & Enrollment",
        [row(id(ceBase, "r0"), [col(id(ceBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [childrenEnrollmentTable])])],
        { defaultExpanded: true },
    );

    // 3. Household & primary contact
    const hcBase = id("opportunities", "lead", "household_contact");
    const cbBase = id(hcBase, "r0c0", "contact");
    const contactBlock: LayoutItem = {
        id: id(cbBase, "group"),
        kind: "field_group",
        refKey: "contact_block",
        label: "Primary contact",
        rows: [
            row(id(cbBase, "r0"), [col(id(cbBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [fieldItem(id(cbBase, "r0c0"), "person.primary_contact_name", "Full name", "text", undefined, PERSON_LINK)])]),
            row(id(cbBase, "r1"), [
                col(id(cbBase, "r1"), 0, HALF, [fieldItem(id(cbBase, "r1c0"), "person.primary_email", "Email", "text", undefined, MAIL_ICON)]),
                col(id(cbBase, "r1"), 1, HALF, [fieldItem(id(cbBase, "r1c1"), "person.primary_phone", "Phone", "phone", undefined, PHONE_ICON)]),
            ]),
        ],
    };
    const householdContact = section("household_contact", "Household & Primary Contact", [
        row(id(hcBase, "r0"), [
            col(id(hcBase, "r0"), 0, HALF, [
                templateItem(id(hcBase, "r0c0"), "household", "{last_name} Household", "Household", HOME_ICON),
                fieldItem(id(hcBase, "r0c0"), "opportunity.location_id", "Location", "text", undefined, LOCATION_ICON),
                fieldItem(id(hcBase, "r0c0"), "opportunity.status_key", "Lead status", "status"),
            ]),
            col(id(hcBase, "r0"), 1, HALF, [
                contactBlock,
                fieldItem(
                    id(hcBase, "r0c1"),
                    "person.secondary_contact_name",
                    "Secondary contact",
                    "text",
                    { type: "exists", path: "person.secondary_contact_name" },
                    PERSON_LINK,
                ),
            ]),
        ]),
    ]);

    // 4. Lead Source — 3 columns
    const lsBase = id("opportunities", "lead", "lead_source");
    const leadSource = section("lead_source", "Lead Source", [
        row(id(lsBase, "r0"), [
            col(id(lsBase, "r0"), 0, THIRD, [fieldItem(id(lsBase, "r0c0"), "opportunity.source", "Source", "text")]),
            col(id(lsBase, "r0"), 1, THIRD, [fieldItem(id(lsBase, "r0c1"), "opportunity.channel", "Channel", "text")]),
            col(id(lsBase, "r0"), 2, THIRD, [fieldItem(id(lsBase, "r0c2"), "opportunity.campaign", "Campaign", "text")]),
        ]),
    ], {
        metadata: {
            [LAYOUT_SECTION_PRIORITY_METADATA_KEY]: 40,
            [LAYOUT_SECTION_COLLAPSE_WHEN_EMPTY_METADATA_KEY]: true,
            [LAYOUT_SECTION_SHOW_WHEN_EMPTY_METADATA_KEY]: false,
        },
    });

    // 5. Notes / Recent Communication — widgets (notes before comm per rail priority)
    const ncBase = id("opportunities", "lead", "notes_comm");
    const notesComm = section("notes_communication", "Notes / Recent Communication", [
        row(id(ncBase, "r0"), [col(id(ncBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [widgetItem(id(ncBase, "r0c0"), "notes", "Notes", "list")])]),
        row(id(ncBase, "r1"), [col(id(ncBase, "r1"), 0, LAYOUT_GRID_COLUMNS, [widgetItem(id(ncBase, "r1c0"), "recent_communication", "Recent communication", "feed")])]),
    ], { metadata: railSectionMetadata(20) });

    // 6. Activity — preview from VM/layout-record fields
    const actBase = id("opportunities", "lead", "activity");
    const activity = section("activity", "Activity", [
        row(id(actBase, "r0"), [col(id(actBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [widgetItem(id(actBase, "r0c0"), "activity", "Activity", "feed")])]),
    ], { metadata: railSectionMetadata(10) });

    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "drawer",
        entityType: "opportunities",
        sections: [leadSummary, childrenEnrollment, householdContact, leadSource, notesComm, activity],
        metadata: { seededFrom: "lead_default", template: "lead_drawer_v2" },
    };
}

/** Attach a queue-card zone hint to an item (bounded vocabulary). */
function zone(item: LayoutItem, z: string): LayoutItem {
    item.metadata = { ...(item.metadata ?? {}), zone: z };
    return item;
}

/**
 * Lead queue card default — mirrors the production work-unit queue card
 * (web/app/adminV2/components/workspace/blocks/QueueBlock.tsx +
 * QueueRowOperationalBands.tsx). Items carry a bounded `metadata.zone`; the
 * queue renderer places them in the card's header / body / actions zones:
 *
 *   header:  house icon + "{last_name} Household" title · status pill ·
 *            attention/urgent line (conditional) · location label
 *   body:    contact row (person icon, name, phone, email) ·
 *            one row per child (child icon, name + age, program) · tour row
 *   actions: Open / Message / Update Status / Ask BOS (simulated)
 *
 * Computed display text for the title, pill display for status, the location
 * LABEL (not location.id), and lucide/Alloy icon adornments.
 */
export function buildLeadQueueDefaultDoc(): LayoutDoc {
    const base = id("opportunities", "lead", "queue_card");
    const LEFT = 9;
    const RIGHT = LAYOUT_GRID_COLUMNS - LEFT; // 3

    // Children related-list: each child renders as its OWN row in the card.
    const childrenRows: LayoutItem = zone(
        {
            id: id(base, "children"),
            kind: "related_list",
            refKey: "children",
            label: "Children",
            source: "children",
            displayMode: "rows",
            related: { entityType: "child" },
            columns: [
                { label: "Child", refKey: "child.name", width: "flexible", adornment: { position: "left", icon: "child" } },
                { label: "Age", refKey: "child.age_band", width: "small" },
                { label: "Program", refKey: "child.program", width: "medium" },
                { label: "Status", refKey: "child.status", width: "small", renderHint: "badge" },
            ],
        },
        "body.children",
    );

    // Header zone.
    const title = zone(templateItem(base, "title", "{last_name} Household", "Household", HOME_ICON), "header.title");
    const status = zone(fieldItem(id(base, "status"), "opportunity.status_key", "Status", "status"), "header.status");
    const attention = zone(templateItem(base, "attn", "{_attention}", "Attention", undefined), "header.attention");
    attention.visibleWhen = { type: "exists", path: "_attention" };
    const location = zone(fieldItem(id(base, "loc"), "opportunity.location", "Location", "text", undefined, LOCATION_ICON), "header.location");

    // Body zone — contact row (name/phone/email) + children + tour.
    const contactName = zone(fieldItem(id(base, "contact"), "person.primary_contact_name", "Contact", "text", undefined, PERSON_LINK), "body.contact");
    const contactPhone = zone(fieldItem(id(base, "phone"), "person.primary_phone", "Phone", "phone", undefined, PHONE_ICON), "body.contact");
    const contactEmail = zone(fieldItem(id(base, "email"), "person.primary_email", "Email", "text", undefined, MAIL_ICON), "body.contact");
    const tour = zone(fieldItem(id(base, "tour"), "opportunity.tour_date", "Tour", "date", undefined, CALENDAR_ICON), "body.tour");

    const leftItems: LayoutItem[] = [title, status, attention, location, contactName, contactPhone, contactEmail, childrenRows, tour];

    // Action stack zone — operational actions (simulated; not layout fields).
    const actionStack = zone(widgetItem(id(base, "actions"), "actions", "Actions", "buttons"), "actions.stack");
    actionStack.metadata = { ...actionStack.metadata, actions: ["Open", "Message", "Update Status", "Ask BOS"], layout: "stack" };

    const card = section(
        "lead_card",
        "Lead queue card",
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
        // Unified queue-card engine: renderAs work_unit_card; queue_context is the
        // Convergence variant discriminator (lead pipeline vs. waitlist candidate).
        metadata: {
            seededFrom: "lead_default",
            template: "lead_queue_card_v1",
            renderAs: "work_unit_card",
            queue_record_layout: defaultLeadQueueLayoutV3(),
            queue_context: {
                lifecycle_key: "enrollment",
                queue_type: "pipeline",
                grain: "case",
            },
        },
    };
}

/**
 * Waitlist queue row variant — candidate grain, structurally distinct from pipeline case row.
 * Canonical specialized variant per layout_contract_v1.md §3.4.2.
 */
export function buildEnrollmentWaitlistQueueDoc(): LayoutDoc {
    const base = id("opportunities", "waitlist", "queue_card");

    const candidateHeader = section("waitlist_candidate", "Candidate", [
        row(id(base, "r0"), [
            col(id(base, "r0"), 0, HALF, [
                fieldItem(id(base, "r0c0"), "child.name", "Child", "text", undefined, CHILD_LINK),
            ]),
            col(id(base, "r0"), 1, HALF, [
                fieldItem(id(base, "r0c1"), "child.status", "Enrollment status", "status"),
            ]),
        ]),
    ], { defaultExpanded: true });

    const programSite = section("waitlist_program_site", "Program & site", [
        row(id(base, "r1"), [
            col(id(base, "r1"), 0, HALF, [fieldItem(id(base, "r1c0"), "child.program", "Program", "text")]),
            col(id(base, "r1"), 1, HALF, [fieldItem(id(base, "r1c1"), "child.location", "Site / location", "text")]),
        ]),
        row(id(base, "r2"), [
            col(id(base, "r2"), 0, HALF, [fieldItem(id(base, "r2c0"), "child.start_date", "Desired start", "date")]),
            col(id(base, "r2"), 1, HALF, [fieldItem(id(base, "r2c1"), "child.room", "Room preference", "text")]),
        ]),
    ]);

    const placement = section("waitlist_placement", "Placement", [
        row(id(base, "r3"), [
            col(id(base, "r3"), 0, LAYOUT_GRID_COLUMNS, [
                widgetItem(id(base, "r3c0"), "waitlist_placement_v2", "Placement priority", "badge"),
            ]),
        ]),
        row(id(base, "r4"), [
            col(id(base, "r4"), 0, LAYOUT_GRID_COLUMNS, [
                widgetItem(id(base, "r4c0"), "waitlist_program_category_group", "Program category section", "group"),
            ]),
        ]),
    ]);

    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "queue",
        entityType: "opportunities",
        sections: [candidateHeader, programSite, placement],
        metadata: {
            seededFrom: "waitlist_default",
            template: "enrollment_waitlist_candidate_v1",
            renderAs: "card",
            queue_record_layout: defaultWaitlistQueueLayoutV3(),
            queue_context: {
                lifecycle_key: "enrollment",
                queue_type: "waitlist",
                grain: "candidate",
            },
        },
    };
}

/** Curated Lead default for opportunities; null for other entities (caller falls back). */
export function buildLeadDefaultDoc(entityType: string, surface: LayoutSurface): LayoutDoc | null {
    if (entityType !== "opportunities") return null;
    return surface === "queue" ? buildLeadQueueDefaultDoc() : buildLeadDrawerDefaultDoc();
}
