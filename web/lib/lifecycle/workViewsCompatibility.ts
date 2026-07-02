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

function filtersFromStageKey(stageKey: string): WorkViewFilterV1[] {
    // Membership is by persisted stage — the runtime `opportunity_stage` field resolves
    // `lifecycle_stage_key` (the stage KEY, e.g. "lead"), so the filter value MUST be the
    // stage key, never the display label (which would never match).
    return [
        { field_key: "opportunity_stage", operator: "equals", value: stageKey },
    ];
}

function workViewFromPerspective(
    perspective: PerspectiveConfigV1Stored,
    stageKey: string,
    stageLabel: string,
    displayOrder: number,
): WorkViewConfigV1Stored {
    const label = perspective.label?.trim() || stageLabel;
    return normalizeWorkViewsDisplayOrder([
        {
            id: slugifyWorkViewId(label),
            label,
            mission: perspective.mission?.trim() || "",
            filters_v1: filtersFromStageKey(stageKey),
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
            seeded.push(workViewFromPerspective(perspective, stage.key, stage.label, order));
            order += 1;
        }
    }

    if (seeded.length) {
        return normalizeWorkViewsDisplayOrder(seeded);
    }

    return [createEmptyWorkViewDraft("New families today")];
}
