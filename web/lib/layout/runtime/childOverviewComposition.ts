/**
 * Child drawer overview composition — enrollment/care workspace shell placement.
 *
 * Mirrors Lead/Person composition doctrine without Lead-specific sections.
 */

import type { LayoutDoc, LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export const CHILD_OVERVIEW_SECTION_KEYS = {
    summary: "child_summary",
    program: "program_enrollment",
    family: "family_relationships",
    schedule: "schedule_attendance",
    notes: "notes_communication",
    activity: "recent_activity",
    documents: "documents",
} as const;

export const CHILD_OVERVIEW_SHELL_GRID = {
    family: 4,
    program: 5,
    rightRail: 3,
} as const;

export const CHILD_COMPOSITION_SECTION_EYEBROWS: Record<string, string> = {
    program_enrollment: "Program & enrollment",
    family_relationships: "Family",
    schedule_attendance: "Schedule",
    recent_activity: "Activity",
    notes_communication: "Communication",
    documents: "Documents",
};

export const COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY = "compositionPrimaryColumnRefs";

export const DEFAULT_CHILD_FAMILY_PRIMARY_COLUMN_REFS = [
    "person.primary_contact_name",
    "person.household_role",
    "person.primary_phone",
] as const;

export const CHILD_OVERVIEW_FAMILY_MAX_VISIBLE_ROWS = 5;

const CHILD_V2_BODY_KEYS = new Set<string>([
    CHILD_OVERVIEW_SECTION_KEYS.program,
    CHILD_OVERVIEW_SECTION_KEYS.family,
    CHILD_OVERVIEW_SECTION_KEYS.schedule,
    CHILD_OVERVIEW_SECTION_KEYS.notes,
    CHILD_OVERVIEW_SECTION_KEYS.activity,
    CHILD_OVERVIEW_SECTION_KEYS.documents,
]);

export type ChildOverviewSectionSlots = {
    program: LayoutSection | null;
    family: LayoutSection | null;
    schedule: LayoutSection | null;
    activity: LayoutSection | null;
    notes: LayoutSection | null;
    documents: LayoutSection | null;
    overflow: LayoutSection[];
};

export function shouldUseChildOverviewComposition(doc: LayoutDoc | null | undefined): boolean {
    if (!doc?.sections?.length) return false;
    if (doc.metadata?.template === "child_drawer_v2") return true;
    const keys = new Set(doc.sections.map((s) => s.key));
    return keys.has(CHILD_OVERVIEW_SECTION_KEYS.program) && keys.has(CHILD_OVERVIEW_SECTION_KEYS.family);
}

export function sliceLayoutDocSections(doc: LayoutDoc, sectionKeys: string[]): LayoutDoc {
    const keySet = new Set(sectionKeys);
    return {
        ...doc,
        sections: doc.sections.filter((s) => keySet.has(s.key)),
    };
}

export function partitionChildOverviewBodySections(doc: LayoutDoc): ChildOverviewSectionSlots {
    const byKey = new Map(doc.sections.map((s) => [s.key, s]));
    const slotted = new Set<string>([
        CHILD_OVERVIEW_SECTION_KEYS.program,
        CHILD_OVERVIEW_SECTION_KEYS.family,
        CHILD_OVERVIEW_SECTION_KEYS.schedule,
        CHILD_OVERVIEW_SECTION_KEYS.activity,
        CHILD_OVERVIEW_SECTION_KEYS.notes,
        CHILD_OVERVIEW_SECTION_KEYS.documents,
    ]);

    return {
        program: byKey.get(CHILD_OVERVIEW_SECTION_KEYS.program) ?? null,
        family: byKey.get(CHILD_OVERVIEW_SECTION_KEYS.family) ?? null,
        schedule: byKey.get(CHILD_OVERVIEW_SECTION_KEYS.schedule) ?? null,
        activity: byKey.get(CHILD_OVERVIEW_SECTION_KEYS.activity) ?? null,
        notes: byKey.get(CHILD_OVERVIEW_SECTION_KEYS.notes) ?? null,
        documents: byKey.get(CHILD_OVERVIEW_SECTION_KEYS.documents) ?? null,
        overflow: doc.sections.filter((s) => !slotted.has(s.key) && s.key !== CHILD_OVERVIEW_SECTION_KEYS.summary),
    };
}

export function childOverviewCompositionHints(
    overrides: Partial<import("@/lib/layout/runtime/layoutRuntimeCompositionContext").LayoutRuntimeCompositionHints> = {},
): import("@/lib/layout/runtime/layoutRuntimeCompositionContext").LayoutRuntimeCompositionHints {
    return {
        childOverviewComposition: true,
        familySummaryOnly: true,
        familyMaxVisibleRows: CHILD_OVERVIEW_FAMILY_MAX_VISIBLE_ROWS,
        compositionSectionSurface: true,
        familyPrimaryColumnsOnly: true,
        summaryStripCompactRow: true,
        childOperatingSummaryCards: true,
        childFamilyCardList: true,
        ...overrides,
    };
}

/** Visual editor preview — match published LayoutDoc block rendering. */
export function childOverviewVisualEditorCompositionHints(
    overrides: Partial<import("@/lib/layout/runtime/layoutRuntimeCompositionContext").LayoutRuntimeCompositionHints> = {},
): import("@/lib/layout/runtime/layoutRuntimeCompositionContext").LayoutRuntimeCompositionHints {
    return childOverviewCompositionHints({ honorLayoutDocBlocks: true, ...overrides });
}

export function summarizeChildDrawerFamilyStrip(record: ProofRuntimeRecord): {
    count: number;
    label: string;
    roleSummary: string | null;
} {
    const adults = record.family_adults;
    const rows = Array.isArray(adults) ? adults : [];
    const count = rows.length;
    if (count === 0) {
        return { count: 0, label: "No family linked", roleSummary: null };
    }

    const roles = rows
        .map((row) => {
            const raw = (row as Record<string, unknown>)["person.household_role"];
            if (raw == null) return null;
            const text = String(raw).trim();
            return text.length > 0 ? text : null;
        })
        .filter((v): v is string => Boolean(v));
    const unique = [...new Set(roles)];
    const rolePart =
        unique.length === 1 ? unique[0]
        : unique.length > 1 ? `${unique.length} roles`
        : null;

    const noun = count === 1 ? "1 adult" : `${count} adults`;
    const roleSummary =
        unique.length === 0 ? null
        : unique.length <= 2 ? unique.join(" · ")
        : `${unique.slice(0, 2).join(" · ")} +${unique.length - 2}`;

    return {
        count,
        label: rolePart ? `${noun} · ${rolePart}` : noun,
        roleSummary,
    };
}

export {
    childActivitySectionHasVisibleContent,
    childDocumentsSectionHasVisibleContent,
    childNotesCommunicationSectionHasVisibleContent,
} from "@/lib/layout/runtime/childOverviewSectionContent";

export function isChildOverviewKnownBodySectionKey(key: string): boolean {
    return CHILD_V2_BODY_KEYS.has(key);
}

export function readCompositionPrimaryColumnRefs(item: LayoutItem): string[] | null {
    const raw = item.metadata?.[COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY];
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const refs = raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    return refs.length > 0 ? refs : null;
}

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
