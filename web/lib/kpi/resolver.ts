import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceRootMetrics } from "@/components/admin/workspace/WorkspaceRootShell";
import {
    buildWorkspaceRootOrgOpportunityKpis,
    type DepartmentLifecycleKpisPayload,
} from "@/lib/workspace/viewModels/workspaceRootRollup";
import { buildDefaultDepartmentKpis, buildDefaultWorkspaceKpis, type DeptWorkUnitRow } from "@/lib/kpi/baseline";
import { getMetricDefinition, isKnownMetricKey, validateMetricForSurface } from "@/lib/kpi/registry";
import type { MetricKey, ResolveKpisResult, WorkspaceKpiPlacementRow } from "@/lib/kpi/types";

const FACET_MAX_WORK_UNITS = 12;

function formatInt(n: number | null | undefined): string {
    if (n == null || Number.isNaN(n)) return "—";
    return String(Math.max(0, Math.floor(n)));
}

function vmFromRow(
    metricKey: MetricKey,
    value: string,
    row: WorkspaceKpiPlacementRow | null
): KPIVm {
    const def = getMetricDefinition(metricKey);
    const lane = (row?.lane_override ?? def.defaultLane) as KPIVm["lane"];
    return {
        id: metricKey,
        label: row?.label_override?.trim() || def.defaultLabel,
        value,
        lane,
    };
}

function mapPipelineCellToMetricKey(orgKpis: KPIVm[], metricKey: MetricKey): KPIVm | null {
    const order = [
        "org.pipeline.active_in_motion",
        "org.pipeline.pipeline_value_open",
        "org.pipeline.closed_outcomes",
    ] as const;
    const idx = order.indexOf(metricKey as (typeof order)[number]);
    if (idx < 0 || idx >= orgKpis.length) return null;
    const src = orgKpis[idx];
    if (!src) return null;
    return {
        id: metricKey,
        label: src.label,
        value: src.value,
        lane: src.lane ?? "business",
        unit: src.unit,
    };
}

function sortPlacements(rows: WorkspaceKpiPlacementRow[]): WorkspaceKpiPlacementRow[] {
    return [...rows].sort((a, b) => {
        if (a.display_order !== b.display_order) return a.display_order - b.display_order;
        return a.metric_key.localeCompare(b.metric_key);
    });
}

export function resolveKpisForWorkspace(params: {
    /** Visible rows only (from API). */
    placementRows: WorkspaceKpiPlacementRow[];
    /**
     * True if any `workspace_kpi_placement` row exists for this org + workspace surface (including hidden).
     * When false and `placementRows` is empty → use baseline. When true and no visible rows → empty strip (explicit hide-all).
     */
    scopeHasPlacementRows: boolean;
    metrics: WorkspaceRootMetrics | null;
    growthSnapshots: Array<{ departmentKey: string; kpis: DepartmentLifecycleKpisPayload | null }>;
}): ResolveKpisResult {
    const warnings: string[] = [];
    const visible = params.placementRows.filter((r) => r.is_visible !== false);
    const baseline = () => buildDefaultWorkspaceKpis(params.metrics, params.growthSnapshots);

    if (visible.length === 0) {
        if (!params.scopeHasPlacementRows) {
            return { items: baseline(), warnings };
        }
        return { items: [], warnings };
    }

    const orgPipeline = buildWorkspaceRootOrgOpportunityKpis(params.growthSnapshots);
    const items: KPIVm[] = [];

    for (const row of sortPlacements(visible)) {
        const mk = row.metric_key;
        if (!isKnownMetricKey(mk)) {
            warnings.push(`unknown_metric_key:${mk}`);
            continue;
        }
        if (!validateMetricForSurface(mk, "workspace")) {
            warnings.push(`surface_mismatch:${mk}:workspace`);
            continue;
        }
        switch (mk) {
            case "org.structure.departments_count":
                items.push(
                    vmFromRow(mk, formatInt(params.metrics?.departments), row)
                );
                break;
            case "org.structure.work_units_count":
                items.push(vmFromRow(mk, formatInt(params.metrics?.workUnits), row));
                break;
            case "org.pipeline.active_in_motion":
            case "org.pipeline.pipeline_value_open":
            case "org.pipeline.closed_outcomes": {
                const cell = mapPipelineCellToMetricKey(orgPipeline, mk);
                if (!cell) {
                    warnings.push(`pipeline_cell_missing:${mk}`);
                    continue;
                }
                if (row.label_override?.trim()) cell.label = row.label_override.trim();
                if (row.lane_override) cell.lane = row.lane_override;
                items.push(cell);
                break;
            }
            default:
                warnings.push(`unhandled_workspace_metric:${mk}`);
        }
    }

    if (items.length === 0) {
        if (!params.scopeHasPlacementRows) {
            return { items: baseline(), warnings };
        }
        return { items: [], warnings };
    }
    return { items, warnings };
}

export function resolveKpisForDepartment(params: {
    placementRows: WorkspaceKpiPlacementRow[];
    /**
     * True if any placement row exists for org + department surface + department_id (including hidden).
     * False + no visible rows → baseline; true + no visible rows → empty strip.
     */
    scopeHasPlacementRows: boolean;
    departmentSurface: "department";
    deptWorkUnits: DeptWorkUnitRow[];
    deptWorkUnitSummaries: Record<string, { total: number; needs_attention: number | null }>;
    deptQueueSummariesLoading: boolean;
    deptQueueSummariesError: string | null;
}): ResolveKpisResult {
    const warnings: string[] = [];
    const baseline = () =>
        buildDefaultDepartmentKpis({
            deptWorkUnits: params.deptWorkUnits,
            deptWorkUnitSummaries: params.deptWorkUnitSummaries,
            deptQueueSummariesLoading: params.deptQueueSummariesLoading,
            deptQueueSummariesError: params.deptQueueSummariesError,
        });

    const visible = params.placementRows.filter((r) => r.is_visible !== false);
    if (visible.length === 0) {
        if (!params.scopeHasPlacementRows) {
            return { items: baseline(), warnings };
        }
        return { items: [], warnings };
    }

    const items: KPIVm[] = [];

    for (const row of sortPlacements(visible)) {
        const mk = row.metric_key;
        if (!isKnownMetricKey(mk)) {
            warnings.push(`unknown_metric_key:${mk}`);
            continue;
        }
        if (!validateMetricForSurface(mk, "department")) {
            warnings.push(`surface_mismatch:${mk}:department`);
            continue;
        }
        if (mk === "dept.wu_queue.total_per_work_unit") {
            const list = params.deptWorkUnits;
            const slice = list.slice(0, FACET_MAX_WORK_UNITS);
            if (list.length > FACET_MAX_WORK_UNITS) {
                warnings.push("facet_cap_exceeded");
            }
            for (const wu of slice) {
                const summary = params.deptWorkUnitSummaries[wu.id];
                const value =
                    params.deptQueueSummariesLoading || params.deptQueueSummariesError
                        ? "—"
                        : summary
                          ? String(summary.total)
                          : "—";
                const key = (wu.key ?? "").trim().toLowerCase();
                const label =
                    key === "enrollment_pipeline" || key === "pipeline_overview"
                        ? "Active inquiries"
                        : wu.name?.trim() || "Work unit";
                items.push({
                    id: `${mk}:${wu.id}`,
                    label,
                    value,
                    lane: row.lane_override ?? "business",
                });
            }
        } else {
            warnings.push(`unhandled_department_metric:${mk}`);
        }
    }

    if (items.length === 0) {
        if (!params.scopeHasPlacementRows) {
            return { items: baseline(), warnings };
        }
        return { items: [], warnings };
    }
    return { items, warnings };
}
