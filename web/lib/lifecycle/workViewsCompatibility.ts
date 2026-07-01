/**
 * Compatibility — derive initial process-level Work Views from legacy stage `perspectives_v1`.
 * Read-only seed for UI when `work_views_v1` is not yet authored.
 */

import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { PerspectiveConfigV1Stored } from "@/lib/lifecycle/perspectiveConfigV1";
import {
    createEmptyWorkViewDraft,
    normalizeWorkViewsDisplayOrder,
    slugifyWorkViewId,
    type WorkViewConfigV1Stored,
    type WorkViewFilterV1,
} from "@/lib/lifecycle/workViewsConfigV1";

function filtersFromStageLabel(stageLabel: string): WorkViewFilterV1[] {
    // Seed with the canonical typed key (legacy `stage` is normalized to this on load anyway).
    return [
        { field_key: "opportunity_stage", operator: "equals", value: stageLabel },
    ];
}

function workViewFromPerspective(
    perspective: PerspectiveConfigV1Stored,
    stageLabel: string,
    displayOrder: number,
): WorkViewConfigV1Stored {
    const label = perspective.label?.trim() || stageLabel;
    return normalizeWorkViewsDisplayOrder([
        {
            id: slugifyWorkViewId(label),
            label,
            mission: perspective.mission?.trim() || "",
            filters_v1: filtersFromStageLabel(stageLabel),
            sort_v1: { field_key: "updated_at", direction: "desc" },
            visible_in_runtime: perspective.visible_in_rail !== false,
            display_order: perspective.display_order ?? displayOrder,
            compat_queue_key: perspective.queue_key,
        },
    ])[0]!;
}

/** Merge saved process work views with compatibility seed from stage perspectives. */
export function resolveProcessWorkViews(params: {
    process: LifecycleBuilderProcessRecord | null | undefined;
    saved: readonly WorkViewConfigV1Stored[] | null | undefined;
}): WorkViewConfigV1Stored[] {
    if (params.saved?.length) {
        return normalizeWorkViewsDisplayOrder(params.saved);
    }

    const seeded: WorkViewConfigV1Stored[] = [];
    let order = 1;
    for (const stage of params.process?.stages ?? []) {
        if (!stage.is_active) continue;
        const perspectives = stage.perspectives_v1 ?? [];
        if (!perspectives.length) continue;
        for (const perspective of perspectives) {
            seeded.push(workViewFromPerspective(perspective, stage.label, order));
            order += 1;
        }
    }

    if (seeded.length) {
        return normalizeWorkViewsDisplayOrder(seeded);
    }

    return [createEmptyWorkViewDraft("New families today")];
}
