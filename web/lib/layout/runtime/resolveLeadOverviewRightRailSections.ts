/**
 * Resolve ordered right-rail sections for Lead overview composition.
 */

import type { LayoutSection } from "@/lib/layout/layoutV2";
import type { LeadOverviewSectionSlots } from "@/lib/layout/runtime/leadOverviewComposition";
import { readLayoutSectionPresentationMetadata } from "@/lib/layout/runtime/layoutSectionPresentationMetadata";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

/** Right-rail sections that pass collapse rules, sorted by layout metadata priority. */
export function resolveLeadOverviewRightRailSections(
    slots: Pick<LeadOverviewSectionSlots, "activity" | "notes">,
    record: ProofRuntimeRecord,
): LayoutSection[] {
    const candidates = [slots.activity, slots.notes].filter((s): s is LayoutSection => s != null);
    return candidates
        .filter((section) =>
            shouldRenderLayoutRuntimeSection(section, record, { compositionShell: true }),
        )
        .sort((a, b) => {
            const pa = readLayoutSectionPresentationMetadata(a).priority;
            const pb = readLayoutSectionPresentationMetadata(b).priority;
            if (pa !== pb) return pa - pb;
            return a.key.localeCompare(b.key);
        });
}
