/**
 * Experience Builder — block placement intent (Sprint 5.18F).
 * Presentation-only section ordering; no LayoutDoc schema changes.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { OpportunityDrawerLayoutZone } from "@/lib/layout/surfaceLayoutRegistry";
import { resolveOpportunityDrawerSectionZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";

function cloneLayoutDoc(doc: LayoutDoc): LayoutDoc {
    return JSON.parse(JSON.stringify(doc)) as LayoutDoc;
}

export const EXPERIENCE_BUILDER_PLACEMENT_INTENTS = [
    "after_selected",
    "top",
    "main",
    "summary_strip",
    "right_rail",
] as const;

export type ExperienceBuilderPlacementIntent = (typeof EXPERIENCE_BUILDER_PLACEMENT_INTENTS)[number];

export const EXPERIENCE_BUILDER_PLACEMENT_LABELS: Record<ExperienceBuilderPlacementIntent, string> = {
    after_selected: "After selected",
    top: "Top (summary strip)",
    main: "Main content",
    summary_strip: "Summary strip",
    right_rail: "Right rail",
};

export function resolveExperienceBuilderPlacementZone(
    doc: LayoutDoc,
    selectedSectionKey: string | null | undefined,
    intent: ExperienceBuilderPlacementIntent,
): OpportunityDrawerLayoutZone {
    if (intent === "after_selected") {
        if (selectedSectionKey) {
            const section = doc.sections.find((s) => s.key === selectedSectionKey);
            if (section) return resolveOpportunityDrawerSectionZone(section);
        }
        return "main";
    }
    if (intent === "top" || intent === "summary_strip") return "summary_strip";
    if (intent === "right_rail") return "right_rail";
    return "main";
}

/** Move a section to immediately after another section in doc.sections order. */
export function moveSectionAfterSelected(
    doc: LayoutDoc,
    sectionKey: string,
    afterSectionKey: string | null | undefined,
): LayoutDoc {
    if (!afterSectionKey || sectionKey === afterSectionKey) return doc;
    const next = cloneLayoutDoc(doc);
    const fromIdx = next.sections.findIndex((s) => s.key === sectionKey);
    const afterIdx = next.sections.findIndex((s) => s.key === afterSectionKey);
    if (fromIdx < 0 || afterIdx < 0) return doc;
    const [section] = next.sections.splice(fromIdx, 1);
    if (!section) return doc;
    const insertAt = fromIdx < afterIdx ? afterIdx : afterIdx + 1;
    next.sections.splice(insertAt, 0, section);
    return next;
}

/** Move a section to the first position within its zone. */
export function moveSectionToStartOfZone(
    doc: LayoutDoc,
    sectionKey: string,
    zone: OpportunityDrawerLayoutZone,
): LayoutDoc {
    const next = cloneLayoutDoc(doc);
    const fromIdx = next.sections.findIndex((s) => s.key === sectionKey);
    if (fromIdx < 0) return doc;
    const [section] = next.sections.splice(fromIdx, 1);
    if (!section) return doc;
    const firstInZone = next.sections.findIndex((s) => resolveOpportunityDrawerSectionZone(s) === zone);
    const insertAt = firstInZone >= 0 ? firstInZone : next.sections.length;
    next.sections.splice(insertAt, 0, section);
    return next;
}

export function applyExperienceBuilderPlacement(
    doc: LayoutDoc,
    sectionKey: string,
    intent: ExperienceBuilderPlacementIntent,
    selectedSectionKey: string | null | undefined,
    zone: OpportunityDrawerLayoutZone,
): LayoutDoc {
    if (intent === "after_selected" && selectedSectionKey) {
        return moveSectionAfterSelected(doc, sectionKey, selectedSectionKey);
    }
    if (intent === "top") {
        return moveSectionToStartOfZone(doc, sectionKey, "summary_strip");
    }
    if (intent === "summary_strip" || intent === "right_rail" || intent === "main") {
        return moveSectionToStartOfZone(doc, sectionKey, zone);
    }
    return doc;
}