/**
 * Resolve ordered right-rail sections for Person overview composition.
 */

import type { LayoutSection } from "@/lib/layout/layoutV2";
import type { PersonOverviewSectionSlots } from "@/lib/layout/runtime/personOverviewComposition";
import { readLayoutSectionPresentationMetadata } from "@/lib/layout/runtime/layoutSectionPresentationMetadata";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export function resolvePersonOverviewRightRailSections(
    slots: Pick<PersonOverviewSectionSlots, "activity" | "notes" | "documents">,
    record: ProofRuntimeRecord,
): LayoutSection[] {
    const candidates = [slots.activity, slots.notes, slots.documents].filter(
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
