/**
 * Layout-runtime section visibility — collapse empty sections using metadata + VM-derived content.
 */

import type { LayoutSection } from "@/lib/layout/layoutV2";
import { CHILD_OVERVIEW_SECTION_KEYS } from "@/lib/layout/runtime/childOverviewComposition";
import {
    leadActivitySectionHasVisibleContent,
    leadLeadSourceSectionHasVisibleContent,
    leadNotesCommunicationSectionHasVisibleContent,
} from "@/lib/layout/runtime/leadOverviewSectionContent";
import { PERSON_OVERVIEW_SECTION_KEYS } from "@/lib/layout/runtime/personOverviewComposition";
import { LEAD_OVERVIEW_SECTION_KEYS } from "@/lib/layout/runtime/leadOverviewComposition";
import {
    personActivitySectionHasVisibleContent,
    personDocumentsSectionHasVisibleContent,
    personNotesCommunicationSectionHasVisibleContent,
} from "@/lib/layout/runtime/personOverviewSectionContent";
import { readLayoutSectionPresentationMetadata } from "@/lib/layout/runtime/layoutSectionPresentationMetadata";
import { shouldSuppressOpportunityDrawerSectionForEditorHidden } from "@/lib/layout/runtime/opportunityDrawerEntityLayoutVisibility";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type LayoutRuntimeSectionVisibilityContext = {
    /** Lead composition shell — applies collapse rules. */
    compositionShell?: boolean;
    /** Summary strip sections never collapse via this path. */
    sectionPresentation?: "default" | "summary_strip";
    /**
     * Phase 4 — honor entity_layouts `layoutEditorHidden` for registered opportunity drawer sections.
     * Set from `isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabled*()` at call sites.
     */
    opportunityEntityLayoutsVisualConfig?: boolean;
};

const DRAWER_OVERVIEW_PREMIUM_EMPTY_SECTIONS = new Set<string>([
    LEAD_OVERVIEW_SECTION_KEYS.activity,
    LEAD_OVERVIEW_SECTION_KEYS.notes,
    PERSON_OVERVIEW_SECTION_KEYS.activity,
    PERSON_OVERVIEW_SECTION_KEYS.notes,
    PERSON_OVERVIEW_SECTION_KEYS.documents,
    CHILD_OVERVIEW_SECTION_KEYS.activity,
    CHILD_OVERVIEW_SECTION_KEYS.notes,
    CHILD_OVERVIEW_SECTION_KEYS.documents,
]);

function sectionHasKnownContent(sectionKey: string, record: ProofRuntimeRecord): boolean {
    switch (sectionKey) {
        case LEAD_OVERVIEW_SECTION_KEYS.activity:
            return leadActivitySectionHasVisibleContent(record);
        case LEAD_OVERVIEW_SECTION_KEYS.notes:
            return leadNotesCommunicationSectionHasVisibleContent(record);
        case LEAD_OVERVIEW_SECTION_KEYS.leadSource:
            return leadLeadSourceSectionHasVisibleContent(record);
        case PERSON_OVERVIEW_SECTION_KEYS.activity:
            return personActivitySectionHasVisibleContent(record);
        case PERSON_OVERVIEW_SECTION_KEYS.notes:
            return personNotesCommunicationSectionHasVisibleContent(record);
        case PERSON_OVERVIEW_SECTION_KEYS.documents:
            return personDocumentsSectionHasVisibleContent(record);
        default:
            return true;
    }
}

/** True when a section should render (respects collapseWhenEmpty / showWhenEmpty metadata). */
export function shouldRenderLayoutRuntimeSection(
    section: LayoutSection,
    record: ProofRuntimeRecord,
    ctx: LayoutRuntimeSectionVisibilityContext = {},
): boolean {
    if (
        shouldSuppressOpportunityDrawerSectionForEditorHidden(
            section,
            ctx.opportunityEntityLayoutsVisualConfig === true,
        )
    ) {
        return false;
    }

    if (ctx.sectionPresentation === "summary_strip") return true;

    const meta = readLayoutSectionPresentationMetadata(section);
    if (meta.showWhenEmpty) return true;
    if (!meta.collapseWhenEmpty) return true;
    if (!ctx.compositionShell) {
        if (section.key === LEAD_OVERVIEW_SECTION_KEYS.notes) {
            return leadNotesCommunicationSectionHasVisibleContent(record);
        }
        if (section.key === PERSON_OVERVIEW_SECTION_KEYS.notes) {
            return personNotesCommunicationSectionHasVisibleContent(record);
        }
        return true;
    }

    if (meta.collapseWhenEmpty && DRAWER_OVERVIEW_PREMIUM_EMPTY_SECTIONS.has(section.key)) {
        return true;
    }

    return sectionHasKnownContent(section.key, record);
}

/** Sort sections by layout metadata priority (lower = higher on rail). */
export function sortLayoutSectionsByPresentationPriority(sections: LayoutSection[]): LayoutSection[] {
    return [...sections].sort((a, b) => {
        const pa = readLayoutSectionPresentationMetadata(a).priority;
        const pb = readLayoutSectionPresentationMetadata(b).priority;
        if (pa !== pb) return pa - pb;
        return a.key.localeCompare(b.key);
    });
}
