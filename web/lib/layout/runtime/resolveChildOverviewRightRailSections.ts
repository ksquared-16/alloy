/**
 * Resolve ordered right-rail sections for Child overview composition.
 */

import type { LayoutSection } from "@/lib/layout/layoutV2";
import type { ChildOverviewSectionSlots } from "@/lib/layout/runtime/childOverviewComposition";
import { readLayoutSectionPresentationMetadata } from "@/lib/layout/runtime/layoutSectionPresentationMetadata";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export function resolveChildOverviewRightRailSections(
    slots: Pick<ChildOverviewSectionSlots, "activity" | "notes" | "documents">,
    record: ProofRuntimeRecord,
): LayoutSection[] {
    const candidates = [slots.documents, slots.notes, slots.activity].filter(
        (s): s is LayoutSection => s != null,
    );
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
