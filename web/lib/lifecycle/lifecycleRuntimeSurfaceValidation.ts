/**
 * Lifecycle runtime surface validation helpers (Settings + tests).
 */

import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";

export type LifecycleActionPlacementSurfaceSummary = {
    department: number;
    work_unit: number;
    right_rail: number;
    queue_row: number;
    drawer: number;
    other: number;
};

export function summarizeLifecycleActionPlacementSurfaces(
    rows: readonly LifecycleConfiguredActionRow[]
): LifecycleActionPlacementSurfaceSummary {
    const out: LifecycleActionPlacementSurfaceSummary = {
        department: 0,
        work_unit: 0,
        right_rail: 0,
        queue_row: 0,
        drawer: 0,
        other: 0,
    };
    for (const row of rows) {
        for (const p of row.placements) {
            const label = (p.surface_label ?? p.placement_label ?? "").toLowerCase();
            if (label.includes("department")) out.department += 1;
            else if (label.includes("queue row")) out.queue_row += 1;
            else if (label.includes("drawer") || label.includes("overflow")) out.drawer += 1;
            else if (label.includes("work unit right") || label.includes("work unit rail")) {
                out.work_unit += 1;
            } else if (label.includes("right rail")) out.right_rail += 1;
            else out.other += 1;
        }
    }
    return out;
}

export function lifecycleNeedsAttentionWorkUnitConfigured(
    workUnits: readonly { key?: string | null }[]
): boolean {
    return workUnits.some((w) => (w.key ?? "").trim().toLowerCase() === "needs_attention");
}

export function formatLifecycleActionPlacementDetail(summary: LifecycleActionPlacementSurfaceSummary): string {
    const parts: string[] = [];
    if (summary.department) parts.push(`${summary.department} department rail`);
    if (summary.work_unit || summary.right_rail) {
        parts.push(`${summary.work_unit + summary.right_rail} work-unit rail`);
    }
    if (summary.queue_row) parts.push(`${summary.queue_row} queue row`);
    if (summary.drawer) parts.push(`${summary.drawer} drawer`);
    if (summary.other) parts.push(`${summary.other} other`);
    if (!parts.length) return "Optional: no actions configured yet.";
    return `Actions matrix: ${parts.join("; ")}.`;
}
