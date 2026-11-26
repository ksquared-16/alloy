/**
 * Lead drawer overview composition — layout-aware shell placement only.
 *
 * North star (not a /settings/layouts replacement):
 * - Maps known section keys into premium dashboard positions (shell grid).
 * - Renders layout-owned sections/items inside those slots via LayoutRuntimeDrawerBodyView.
 * - Preserves unknown/custom sections through overflow fallback rendering.
 * - Never hardcodes field content — items, columns, and widgets come from the LayoutDoc.
 * - Presentation hints (compact summary, row cap) are shell polish; field/column sets are config-owned.
 *
 * Settings path: org-published LayoutDocs from /adminV2/settings/layouts remain authoritative.
 * Composition activates when the resolved doc matches Lead v2 anatomy; custom sections still render.
 */

import type { LayoutDoc, LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";
import { DRAWER_OVERVIEW_SHELL_GRID } from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { formatLayoutRuntimeStatusLabel } from "@/lib/layout/runtime/formatLayoutRuntimeStatusLabel";

export const LEAD_OVERVIEW_SECTION_KEYS = {
    summary: "lead_summary",
    enrollment: "children_enrollment",
    household: "household_contact",
    leadSource: "lead_source",
    notes: "notes_communication",
    activity: "activity",
} as const;

/** Composition shell grid spans (12-col) — placement contract, not field content. */
export const LEAD_OVERVIEW_SHELL_GRID = {
    household: DRAWER_OVERVIEW_SHELL_GRID.leftColumn,
    enrollment: DRAWER_OVERVIEW_SHELL_GRID.mainColumn,
    rightRail: DRAWER_OVERVIEW_SHELL_GRID.rightRail,
} as const;

/** Section eyebrow labels for composition cards (presentation only — not field content). */
export const LEAD_COMPOSITION_SECTION_EYEBROWS: Record<string, string> = {
    children_enrollment: "Enrollment",
    household_contact: "Household",
    activity: "Activity",
    notes_communication: "Communication",
    lead_source: "Lead source",
};

const LEAD_V2_BODY_KEYS = new Set<string>([
    LEAD_OVERVIEW_SECTION_KEYS.enrollment,
    LEAD_OVERVIEW_SECTION_KEYS.household,
    LEAD_OVERVIEW_SECTION_KEYS.leadSource,
    LEAD_OVERVIEW_SECTION_KEYS.notes,
    LEAD_OVERVIEW_SECTION_KEYS.activity,
]);

export const LEAD_OVERVIEW_ENROLLMENT_MAX_VISIBLE_ROWS = 5;

/**
 * Layout item metadata key: ordered refKeys to prefer when composition grid is width-constrained.
 * Stored on related_list items in defaultLeadLayouts / org-published docs — not hardcoded at render time.
 */
export const COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY = "compositionPrimaryColumnRefs";

/** Default primary enrollment columns for lead_drawer_v2 — written onto layout item metadata at seed time. */
export const DEFAULT_LEAD_ENROLLMENT_COMPOSITION_PRIMARY_COLUMN_REFS = [
    "child.name",
    "child.dob_age",
    "child.program",
    "child.start_date",
    "child.schedule",
    "child.status",
] as const;

const CHILDREN_REPEATER_ITEM = {
    id: "children",
    kind: "related_list" as const,
    source: "children",
    refKey: "children",
};

export type LeadOverviewSectionSlots = {
    household: LayoutSection | null;
    enrollment: LayoutSection | null;
    activity: LayoutSection | null;
    notes: LayoutSection | null;
    leadSource: LayoutSection | null;
    /** Sections not mapped to a composition slot — render sequentially below grid. */
    overflow: LayoutSection[];
};

/** True when the resolved doc matches Lead drawer v2 anatomy (org preset or builtin). */
export function shouldUseLeadOverviewComposition(doc: LayoutDoc | null | undefined): boolean {
    if (!doc?.sections?.length) return false;
    if (doc.metadata?.template === "lead_drawer_v2") return true;
    const keys = new Set(doc.sections.map((s) => s.key));
    return keys.has(LEAD_OVERVIEW_SECTION_KEYS.enrollment) && keys.has(LEAD_OVERVIEW_SECTION_KEYS.household);
}

export function sliceLayoutDocSections(doc: LayoutDoc, sectionKeys: string[]): LayoutDoc {
    const keySet = new Set(sectionKeys);
    return {
        ...doc,
        sections: doc.sections.filter((s) => keySet.has(s.key)),
    };
}

export function partitionLeadOverviewBodySections(doc: LayoutDoc): LeadOverviewSectionSlots {
    const byKey = new Map(doc.sections.map((s) => [s.key, s]));
    const slotted = new Set<string>([
        LEAD_OVERVIEW_SECTION_KEYS.household,
        LEAD_OVERVIEW_SECTION_KEYS.enrollment,
        LEAD_OVERVIEW_SECTION_KEYS.activity,
        LEAD_OVERVIEW_SECTION_KEYS.notes,
        LEAD_OVERVIEW_SECTION_KEYS.leadSource,
    ]);

    return {
        household: byKey.get(LEAD_OVERVIEW_SECTION_KEYS.household) ?? null,
        enrollment: byKey.get(LEAD_OVERVIEW_SECTION_KEYS.enrollment) ?? null,
        activity: byKey.get(LEAD_OVERVIEW_SECTION_KEYS.activity) ?? null,
        notes: byKey.get(LEAD_OVERVIEW_SECTION_KEYS.notes) ?? null,
        leadSource: byKey.get(LEAD_OVERVIEW_SECTION_KEYS.leadSource) ?? null,
        overflow: doc.sections.filter((s) => !slotted.has(s.key) && s.key !== LEAD_OVERVIEW_SECTION_KEYS.summary),
    };
}

export function leadOverviewCompositionHints(
    overrides: Partial<import("@/lib/layout/runtime/layoutRuntimeCompositionContext").LayoutRuntimeCompositionHints> = {},
): import("@/lib/layout/runtime/layoutRuntimeCompositionContext").LayoutRuntimeCompositionHints {
    return {
        leadOverviewComposition: true,
        childrenListSummaryOnly: true,
        enrollmentMaxVisibleRows: LEAD_OVERVIEW_ENROLLMENT_MAX_VISIBLE_ROWS,
        compositionSectionSurface: true,
        enrollmentPrimaryColumnsOnly: true,
        summaryStripCompactRow: true,
        /** Patch 11 — read-first roster; inline edit only after row Edit action. */
        enrollmentRosterReadFirst: true,
        leadOperatingSummaryCards: true,
        leadEnrollmentCardList: true,
        suppressRelatedListPanelHeader: true,
        ...overrides,
    };
}

/** Visual editor preview — match published LayoutDoc block rendering. */
export function leadOverviewVisualEditorCompositionHints(
    overrides: Partial<import("@/lib/layout/runtime/layoutRuntimeCompositionContext").LayoutRuntimeCompositionHints> = {},
): import("@/lib/layout/runtime/layoutRuntimeCompositionContext").LayoutRuntimeCompositionHints {
    return leadOverviewCompositionHints({ honorLayoutDocBlocks: true, ...overrides });
}

export function summarizeLeadDrawerChildrenStrip(record: ProofRuntimeRecord): {
    count: number;
    label: string;
    statusSummary: string | null;
} {
    const rows = readLayoutRuntimeRepeaterRows(record, CHILDREN_REPEATER_ITEM);
    const count = rows.length;
    if (count === 0) {
        return { count: 0, label: "No children linked", statusSummary: null };
    }

    const statuses = rows
        .map((row) => {
            const raw = row["child.status"] ?? row["inquiry_child.outcome_status_key"];
            if (raw == null) return null;
            const text = formatLayoutRuntimeStatusLabel(raw, {
                refKey: row["child.status"] != null ? "child.status" : "inquiry_child.outcome_status_key",
                renderHint: "status",
            });
            return text && text.length > 0 ? text : null;
        })
        .filter((v): v is string => Boolean(v));
    const unique = [...new Set(statuses)];
    const statusPart =
        unique.length === 1 ? unique[0]
        : unique.length > 1 ? `${unique.length} statuses`
        : null;

    const noun = count === 1 ? "1 child" : `${count} children`;
    const statusSummary =
        unique.length === 0 ? null
        : unique.length <= 2 ? unique.join(" · ")
        : `${unique.slice(0, 2).join(" · ")} +${unique.length - 2}`;

    return {
        count,
        label: statusPart ? `${noun} · ${statusPart}` : noun,
        statusSummary,
    };
}

export {
    leadActivitySectionHasVisibleContent,
    leadLeadSourceSectionHasVisibleContent,
    leadNotesCommunicationSectionHasVisibleContent,
} from "@/lib/layout/runtime/leadOverviewSectionContent";

export function isLeadOverviewKnownBodySectionKey(key: string): boolean {
    return LEAD_V2_BODY_KEYS.has(key);
}

/** Read composition primary column refs from a layout-owned related_list item. */
export function readCompositionPrimaryColumnRefs(item: LayoutItem): string[] | null {
    const raw = item.metadata?.[COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY];
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const refs = raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    return refs.length > 0 ? refs : null;
}

/** Filter related-list columns using layout item metadata when composition primary-only mode is active. */
export function filterRelatedListColumnsForComposition<T extends { refKey: string }>(
    columns: T[],
    item: LayoutItem,
    primaryOnly: boolean,
): T[] {
    if (!primaryOnly) return columns;
    const refs = readCompositionPrimaryColumnRefs(item);
    if (!refs?.length) return columns;
    const refSet = new Set(refs);
    const filtered = columns.filter((c) => refSet.has(c.refKey));
    return filtered.length > 0 ? filtered : columns;
}
