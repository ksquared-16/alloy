/**
 * KPI / throughput labels when counts use lifecycle visibility (not assignment-home gates).
 */

import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { DeptWorkUnitRow } from "@/lib/kpi/baseline";

export function deptKpiWorkUnitsForLifecycleVisibility(
    workUnits: DeptWorkUnitRow[],
    builderOwnedLifecycle: boolean,
    isLifecycleStageRow: (row: { key?: string | null; metadata?: unknown }) => boolean
): DeptWorkUnitRow[] {
    if (!builderOwnedLifecycle) return workUnits;
    return workUnits.filter(isLifecycleStageRow);
}

export function applyLifecycleVisibilityKpiLabels(items: KPIVm[]): KPIVm[] {
    return items.map((item) => {
        if (item.id === "baseline.ctx.dept.total_in_scope") {
            return { ...item, label: "Visible in department (lifecycle)" };
        }
        if (item.id === "baseline.ctx.wu.total_in_queue") {
            return { ...item, label: "Visible in work unit (lifecycle)" };
        }
        if (item.id === "baseline.ctx.wu.selected_queue_count") {
            return {
                ...item,
                label: item.label?.trim()
                    ? `${item.label} (visible)`
                    : "This queue (visible)",
            };
        }
        if (item.id.startsWith("wu_") || item.id.startsWith("baseline.ctx.dept.")) {
            return item;
        }
        return item;
    });
}

/** Prefer lifecycle stage WU for action rail bootstrap on builder-owned departments. */
export function resolveDeptRightRailWorkUnitId(
    workUnits: Array<{ id: string; key?: string | null }>,
    isLifecycleStageRow: (row: { key?: string | null }) => boolean
): string {
    const lifecycle = workUnits.find((w) => isLifecycleStageRow(w));
    if (lifecycle?.id) return lifecycle.id;
    const pipeline = workUnits.find(
        (w) => (w.key ?? "").trim().toLowerCase() === "enrollment_pipeline"
    );
    return pipeline?.id ?? workUnits[0]?.id ?? "";
}

export function lifecycleThroughputCardTitle(wuName: string, total: number | null): string {
    const base = wuName.trim() || "Work unit";
    if (total == null) return `${base}. Count pending.`;
    return `${base}. ${total} visible by lifecycle filter.`;
}
