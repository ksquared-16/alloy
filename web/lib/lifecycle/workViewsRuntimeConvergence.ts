/**
 * Process-level Work Views → runtime operational perspectives (Phase 3A convergence).
 */

import type { PerspectiveConfigV1Stored } from "@/lib/lifecycle/perspectiveConfigV1";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

export type WorkViewCompatQueueLane = {
    queueKey: string;
    label: string;
};

export function workViewToOperationalPerspective(
    view: WorkViewConfigV1Stored,
): PerspectiveConfigV1Stored | null {
    const queueKey = view.compat_queue_key?.trim();
    if (!queueKey) return null;
    return {
        queue_key: queueKey,
        label: view.label?.trim() || queueKey,
        mission: view.mission?.trim() || undefined,
        display_order: view.display_order,
        visible_in_rail: view.visible_in_runtime !== false,
    };
}

/** Convert saved process work views to runtime perspective rows. */
export function operationalPerspectivesFromWorkViews(
    workViews: readonly WorkViewConfigV1Stored[] | null | undefined,
    laneKeys: readonly string[],
): PerspectiveConfigV1Stored[] {
    if (!workViews?.length) return [];

    const laneSet = new Set(laneKeys.map((k) => k.trim()).filter(Boolean));
    const rows = workViews
        .map(workViewToOperationalPerspective)
        .filter((row): row is PerspectiveConfigV1Stored => row != null);

    if (!laneKeys.length) return rows;

    const matched = rows.filter((row) => laneSet.has(row.queue_key));
    return matched.length ? matched : rows;
}

/** Assign compatibility queue keys from pipeline lanes when missing (save-time). */
export function enrichWorkViewsCompatQueueKeys(
    views: readonly WorkViewConfigV1Stored[],
    lanes: readonly WorkViewCompatQueueLane[],
): WorkViewConfigV1Stored[] {
    if (!lanes.length) return [...views];

    return views.map((view, index) => {
        if (view.compat_queue_key?.trim()) return view;

        const labelNorm = view.label.trim().toLowerCase();
        const byLabel = lanes.find((lane) => lane.label.trim().toLowerCase() === labelNorm);
        const byKey = lanes.find((lane) => lane.queueKey.trim().toLowerCase() === labelNorm.replace(/\s+/g, "_"));
        const fallback = lanes[index] ?? lanes[0];

        const match = byLabel ?? byKey ?? fallback;
        return match ? { ...view, compat_queue_key: match.queueKey } : view;
    });
}
