/**
 * Person drawer overview composition — relationship workspace shell placement.
 *
 * Mirrors Lead composition doctrine without Lead-specific sections or resolvers.
 */

import type { LayoutDoc, LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export const PERSON_OVERVIEW_SECTION_KEYS = {
    summary: "person_summary",
    household: "household_relationships",
    children: "connected_children",
    contact: "contact_information",
    notes: "notes_communication",
    activity: "recent_activity",
    documents: "documents",
} as const;

export const PERSON_OVERVIEW_SHELL_GRID = {
    household: 3,
    children: 7,
    rightRail: 2,
} as const;

export const PERSON_COMPOSITION_SECTION_EYEBROWS: Record<string, string> = {
    household_relationships: "Household",
    connected_children: "Connected children",
    contact_information: "Contact",
    recent_activity: "Activity",
    notes_communication: "Communication",
    documents: "Documents",
};

export const COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY = "compositionPrimaryColumnRefs";

export const DEFAULT_PERSON_CONNECTED_CHILDREN_PRIMARY_COLUMN_REFS = [
    "child.name",
    "child.date_of_birth",
    "child.age_band",
    "child.status",
] as const;

export const PERSON_OVERVIEW_CONNECTED_CHILDREN_MAX_VISIBLE_ROWS = 5;

const PERSON_V2_BODY_KEYS = new Set<string>([
    PERSON_OVERVIEW_SECTION_KEYS.household,
    PERSON_OVERVIEW_SECTION_KEYS.children,
    PERSON_OVERVIEW_SECTION_KEYS.contact,
    PERSON_OVERVIEW_SECTION_KEYS.notes,
    PERSON_OVERVIEW_SECTION_KEYS.activity,
    PERSON_OVERVIEW_SECTION_KEYS.documents,
]);

const CHILDREN_REPEATER_ITEM = {
    id: "household_children",
    kind: "related_list" as const,
    source: "household_children",
    refKey: "household_children",
};

export type PersonOverviewSectionSlots = {
    household: LayoutSection | null;
    children: LayoutSection | null;
    contact: LayoutSection | null;
    activity: LayoutSection | null;
    notes: LayoutSection | null;
    documents: LayoutSection | null;
    overflow: LayoutSection[];
};

export function shouldUsePersonOverviewComposition(doc: LayoutDoc | null | undefined): boolean {
    if (!doc?.sections?.length) return false;
    if (doc.metadata?.template === "person_drawer_v2") return true;
    const keys = new Set(doc.sections.map((s) => s.key));
    return keys.has(PERSON_OVERVIEW_SECTION_KEYS.household) && keys.has(PERSON_OVERVIEW_SECTION_KEYS.children);
}

export function sliceLayoutDocSections(doc: LayoutDoc, sectionKeys: string[]): LayoutDoc {
    const keySet = new Set(sectionKeys);
    return {
        ...doc,
        sections: doc.sections.filter((s) => keySet.has(s.key)),
    };
}

export function partitionPersonOverviewBodySections(doc: LayoutDoc): PersonOverviewSectionSlots {
    const byKey = new Map(doc.sections.map((s) => [s.key, s]));
    const slotted = new Set<string>([
        PERSON_OVERVIEW_SECTION_KEYS.household,
        PERSON_OVERVIEW_SECTION_KEYS.children,
        PERSON_OVERVIEW_SECTION_KEYS.contact,
        PERSON_OVERVIEW_SECTION_KEYS.activity,
        PERSON_OVERVIEW_SECTION_KEYS.notes,
        PERSON_OVERVIEW_SECTION_KEYS.documents,
    ]);

    return {
        household: byKey.get(PERSON_OVERVIEW_SECTION_KEYS.household) ?? null,
        children: byKey.get(PERSON_OVERVIEW_SECTION_KEYS.children) ?? null,
        contact: byKey.get(PERSON_OVERVIEW_SECTION_KEYS.contact) ?? null,
        activity: byKey.get(PERSON_OVERVIEW_SECTION_KEYS.activity) ?? null,
        notes: byKey.get(PERSON_OVERVIEW_SECTION_KEYS.notes) ?? null,
        documents: byKey.get(PERSON_OVERVIEW_SECTION_KEYS.documents) ?? null,
        overflow: doc.sections.filter((s) => !slotted.has(s.key) && s.key !== PERSON_OVERVIEW_SECTION_KEYS.summary),
    };
}

export function personOverviewCompositionHints(): import("@/lib/layout/runtime/layoutRuntimeCompositionContext").LayoutRuntimeCompositionHints {
    return {
        personOverviewComposition: true,
        connectedChildrenSummaryOnly: true,
        connectedChildrenMaxVisibleRows: PERSON_OVERVIEW_CONNECTED_CHILDREN_MAX_VISIBLE_ROWS,
        compositionSectionSurface: true,
        connectedChildrenPrimaryColumnsOnly: true,
        summaryStripCompactRow: true,
        personOperatingSummaryCards: true,
    };
}

export function summarizePersonDrawerChildrenStrip(record: ProofRuntimeRecord): {
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
            const raw = row["child.status"] ?? row["child.status_key"];
            if (raw == null) return null;
            const text = String(raw).trim();
            return text.length > 0 ? text : null;
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
    personActivitySectionHasVisibleContent,
    personDocumentsSectionHasVisibleContent,
    personNotesCommunicationSectionHasVisibleContent,
} from "@/lib/layout/runtime/personOverviewSectionContent";

export function isPersonOverviewKnownBodySectionKey(key: string): boolean {
    return PERSON_V2_BODY_KEYS.has(key);
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
