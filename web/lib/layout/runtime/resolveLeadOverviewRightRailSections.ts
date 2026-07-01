/**
 * Resolve ordered right-rail sections for Lead overview composition.
 */

import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import type { LeadOverviewSectionSlots } from "@/lib/layout/runtime/leadOverviewComposition";
import { readLayoutSectionPresentationMetadata } from "@/lib/layout/runtime/layoutSectionPresentationMetadata";
import { sortLayoutSectionsByDocPosition } from "@/lib/layout/runtime/orderLayoutSectionsByDocPosition";
import {
    shouldRenderLayoutRuntimeSection,
    type LayoutRuntimeSectionVisibilityContext,
} from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

/** Right-rail sections that pass collapse rules, sorted by doc position or metadata priority. */
export function resolveLeadOverviewRightRailSections(
    slots: Pick<LeadOverviewSectionSlots, "activity" | "notes">,
    record: ProofRuntimeRecord,
    visibilityCtx: LayoutRuntimeSectionVisibilityContext = { compositionShell: true },
    doc?: LayoutDoc | null,
): LayoutSection[] {
    const candidates = [slots.activity, slots.notes].filter((s): s is LayoutSection => s != null);
    const visible = candidates.filter((section) =>
        shouldRenderLayoutRuntimeSection(section, record, visibilityCtx),
    );

    if (visibilityCtx.opportunityEntityLayoutsVisualConfig && doc) {
        return sortLayoutSectionsByDocPosition(doc, visible);
    }

    return visible.sort((a, b) => {
        const pa = readLayoutSectionPresentationMetadata(a).priority;
        const pb = readLayoutSectionPresentationMetadata(b).priority;
        if (pa !== pb) return pa - pb;
        return a.key.localeCompare(b.key);
    });
}
