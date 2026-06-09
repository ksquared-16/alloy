/**
 * Layout V2 — curated default Person & Child record drawers (completion pass).
 *
 * Same doctrine as the Lead drawer (see defaultLeadLayouts.ts): center-modal
 * shell + fixed core tabs + a layout-driven Overview body of Sections → Rows →
 * Columns → Items, with field groups, related lists, and widget placeholders.
 * Presentation only — NOT wired into live Person/Child drawers. RefKeys follow
 * the canonical namespaces (child.* durable, inquiry_child.* enrollment; never
 * new child_inquiry.*). See docs/platform_convergence/child_namespace_addendum.md.
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
    type LayoutSurface,
} from "./layoutV2";
import { buildPersonDrawerDefaultDoc } from "./defaultPersonLayouts";

const id = (...p: string[]) => p.join("-");
const HALF = LAYOUT_GRID_COLUMNS / 2;
const ICON = (icon: LayoutFieldAdornment["icon"]): LayoutFieldAdornment => ({ position: "left", icon });

function fieldItem(base: string, refKey: string, label: string, renderHint: LayoutRenderHint = "text", adornment?: LayoutFieldAdornment): LayoutItem {
    const item: LayoutItem = { id: id(base, refKey.replace(/\./g, "_")), kind: "field", refKey, label, renderHint, editable: true };
    if (adornment) item.adornment = adornment;
    return item;
}
function widgetItem(base: string, widgetKey: string, label: string, displayMode?: string): LayoutItem {
    return { id: id(base, "w", widgetKey), kind: "widget_placeholder", refKey: widgetKey, label, widget: { widgetKey, displayMode, note: `${label} widget` } };
}
function col(base: string, idx: number, width: number, items: LayoutItem[]) {
    return { id: id(base, `c${idx}`), width, items };
}
function row(base: string, columns: ReturnType<typeof col>[]): LayoutRow {
    return { id: base, columns };
}
function section(entity: string, key: string, title: string, rows: LayoutRow[], defaultExpanded = false): LayoutSection {
    return { id: id(entity, key), key, title, collapsible: true, defaultExpanded, rows };
}

/** Person (Contact / Parent) drawer default — relationship workspace v2. */
export { buildPersonDrawerDefaultDoc } from "./defaultPersonLayouts";
export function buildChildDrawerDefaultDoc(): LayoutDoc {
    const e = "child";
    // 1. Child Summary
    const cs = id(e, "summary");
    const summary = section(e, "child_summary", "Child Summary", [
        row(id(cs, "r0"), [
            col(id(cs, "r0"), 0, HALF, [
                fieldItem(cs, "child.name", "Child name", "text", ICON("child")),
                fieldItem(cs, "child.date_of_birth", "Date of birth", "date", ICON("calendar")),
                fieldItem(cs, "child.age_band", "Age", "text"),
            ]),
            col(id(cs, "r0"), 1, HALF, [
                fieldItem(cs, "inquiry_child.desired_program_type", "Program", "text"),
                fieldItem(cs, "inquiry_child.desired_start_date", "Desired start", "date", ICON("calendar")),
                fieldItem(cs, "inquiry_child.desired_schedule_type", "Schedule", "text"),
                fieldItem(cs, "child.status", "Status", "status"),
            ]),
        ]),
    ], true);

    // 2. Family / Contacts
    const fc = id(e, "family");
    const family = section(e, "family_contacts", "Family / Contacts", [
        row(id(fc, "r0"), [
            col(id(fc, "r0"), 0, HALF, [fieldItem(fc, "person.primary_contact_name", "Primary contact", "text", ICON("person"))]),
            col(id(fc, "r0"), 1, HALF, [fieldItem(fc, "person.primary_phone", "Phone", "phone", ICON("phone")), fieldItem(fc, "person.primary_email", "Email", "text", ICON("mail"))]),
        ]),
    ], true);

    // 3. Enrollment / Opportunity context
    const en = id(e, "enrollment");
    const enrollment = section(e, "enrollment_context", "Enrollment / Opportunity context", [
        row(id(en, "r0"), [
            col(id(en, "r0"), 0, HALF, [fieldItem(en, "inquiry_child.outcome_status_key", "Enrollment status", "status")]),
            col(id(en, "r0"), 1, HALF, [fieldItem(en, "opportunity.status_key", "Lead status", "status")]),
        ]),
    ]);

    // 4. Notes / Activity
    const nb = id(e, "notes");
    const notes = section(e, "notes_activity", "Notes / Activity", [row(id(nb, "r0"), [col(id(nb, "r0"), 0, LAYOUT_GRID_COLUMNS, [widgetItem(nb, "notes", "Notes", "list")])])]);

    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "drawer",
        entityType: e,
        sections: [summary, family, enrollment, notes],
        metadata: { seededFrom: "child_default", template: "child_drawer_v1" },
    };
}

/**
 * Curated record-drawer default for person/child (no entityPresentation registry
 * entry); null for anything else. Drawer surface only.
 */
export function buildRecordDrawerDefaultDoc(entityType: string, surface: LayoutSurface): LayoutDoc | null {
    if (surface !== "drawer") return null;
    if (entityType === "person") return buildPersonDrawerDefaultDoc();
    if (entityType === "child") return buildChildDrawerDefaultDoc();
    return null;
}
