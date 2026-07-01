/**
 * Work-unit route critical-path lane timing — capture locally via DevTools:
 * `reportWorkUnitCriticalPathLanes()` or filter `[perf.wu.critical_path]`.
 */

import { alloyPerfGet, alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import { emitAdminV2Perf } from "@/lib/perf/adminV2PerfLog";

const TAG = "[perf.wu.critical_path]";

export type WorkUnitCriticalPathLane =
    | "shell_chrome"
    | "header_chips"
    | "queue_rows"
    | "actions_rail"
    | "kpi_or_summary";

export type WorkUnitLaneTimingRow = {
    lane: WorkUnitCriticalPathLane;
    placeholder_visible_ms: number | null;
    real_data_ms: number | null;
    data_source: string;
    blocking_dependency: string;
    can_join_bootstrap: "yes" | "partial" | "no";
    can_prefetch: "yes" | "partial" | "no";
    fix: string;
};

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function originMs(): number {
    const o =
        alloyPerfGet("route_work_unit_shell_visible") ??
        alloyPerfGet("work_unit_navigation_start") ??
        alloyPerfGet("work_unit_start");
    return o != null ? Number(o) : nowMs();
}

function relFromOrigin(mark: string): number | null {
    const t = alloyPerfGet(mark);
    if (t == null) return null;
    return Math.round(Number(t) - originMs());
}

function log(event: string, payload: Record<string, unknown>): void {
    if (typeof window === "undefined") return;
    console.info(TAG, { event, ...payload });
}

export function resetWorkUnitCriticalPathTrace(): void {
    const perf = typeof window !== "undefined" ? window.__alloyPerf : null;
    if (!perf?.marks) return;
    for (const key of Object.keys(perf.marks)) {
        if (key.startsWith("wu_lane_")) delete perf.marks[key];
    }
}

function markLane(phase: "placeholder" | "real", lane: WorkUnitCriticalPathLane, extra?: Record<string, unknown>): void {
    const t = nowMs();
    const key = `wu_lane_${lane}_${phase}`;
    if (alloyPerfGet(key) != null) return;
    alloyPerfSet(key, t);
    log(`lane_${phase}`, {
        lane,
        ms: Math.round(t),
        since_origin_ms: relFromOrigin(key),
        ...extra,
    });
}

export function markWorkUnitLaneShellChromePlaceholder(): void {
    markLane("placeholder", "shell_chrome", { source: "buildWorkUnitRouteShellPlaceholder" });
}

export function markWorkUnitLaneShellChromeReal(extra?: Record<string, unknown>): void {
    markLane("real", "shell_chrome", { source: "operational-bootstrap|legacy wu+dept", ...extra });
}

export function markWorkUnitLaneHeaderChipsPlaceholder(): void {
    markLane("placeholder", "header_chips", { source: "queueTabPlaceholders|queue_def" });
}

export function markWorkUnitLaneHeaderChipsReal(extra?: Record<string, unknown>): void {
    markLane("real", "header_chips", { source: "bootstrap.queue.summaries|queues list API", ...extra });
}

export function markWorkUnitLaneQueueRowsPlaceholder(): void {
    markLane("placeholder", "queue_rows", { source: "WorkUnitQueueLaneRowSkeleton|rowsLoading" });
}

export function markWorkUnitLaneQueueRowsReal(extra?: Record<string, unknown>): void {
    markLane("real", "queue_rows", { source: "bootstrap.primary_lane|queue items API", ...extra });
}

export function markWorkUnitLaneActionsRailPlaceholder(): void {
    markLane("placeholder", "actions_rail", { source: "WorkspaceActionsRailPlaceholder|empty rail" });
}

export function markWorkUnitLaneActionsRailReal(extra?: Record<string, unknown>): void {
    markLane("real", "actions_rail", { source: "bootstrap.right_rail_actions|fetchWorkspaceRightRail", ...extra });
}

export function markWorkUnitLaneKpiPlaceholder(): void {
    markLane("placeholder", "kpi_or_summary", { source: "WorkspaceQuietKpiReserve|KpiStripSkeleton" });
}

export function markWorkUnitLaneKpiReal(extra?: Record<string, unknown>): void {
    markLane("real", "kpi_or_summary", { source: "bootstrap.kpi_placements|loadWuKpiPlacements", ...extra });
}

export function markWorkUnitAboveFoldCoordinated(extra?: Record<string, unknown>): void {
    const t = nowMs();
    if (alloyPerfGet("wu_lane_above_fold_coordinated") != null) return;
    alloyPerfSet("wu_lane_above_fold_coordinated", t);
    log("above_fold_coordinated", {
        ms: Math.round(t),
        since_origin_ms: relFromOrigin("wu_lane_above_fold_coordinated"),
        ...extra,
    });
}

/** Static audit metadata (timings filled from marks at report time). */
const LANE_AUDIT_META: Omit<WorkUnitLaneTimingRow, "placeholder_visible_ms" | "real_data_ms">[] = [
    {
        lane: "shell_chrome",
        data_source: "operational-bootstrap (dept+wu) or page cache",
        blocking_dependency: "departmentId+workUnitId",
        can_join_bootstrap: "yes",
        can_prefetch: "partial",
        fix: "Shell identity on bootstrap return; route placeholder until then",
    },
    {
        lane: "header_chips",
        data_source: "bootstrap.queue.summaries",
        blocking_dependency: "shell_chrome",
        can_join_bootstrap: "yes",
        can_prefetch: "partial",
        fix: "Reveal chips with summaries (not oper-lane gate)",
    },
    {
        lane: "queue_rows",
        data_source: "bootstrap.primary_lane inline or GET /api/admin/queues/...",
        blocking_dependency: "selectedQueueKey + summaries",
        can_join_bootstrap: "partial",
        can_prefetch: "yes",
        fix: "Row skeleton in-lane; inline primary_lane when not rows_deferred",
    },
    {
        lane: "actions_rail",
        data_source: "bootstrap.right_rail_actions (enrollment)",
        blocking_dependency: "shell_chrome",
        can_join_bootstrap: "yes",
        can_prefetch: "no",
        fix: "Apply right_rail_actions synchronously on bootstrap (not idle defer)",
    },
    {
        lane: "kpi_or_summary",
        data_source: "kpi_placements deferred or loadWuKpiPlacements",
        blocking_dependency: "queue_summaries (optional)",
        can_join_bootstrap: "partial",
        can_prefetch: "no",
        fix: "Defer KPI strip until queue lane coordinated (Class C)",
    },
];

export function buildWorkUnitLaneTimingTable(): WorkUnitLaneTimingRow[] {
    return LANE_AUDIT_META.map((meta) => ({
        ...meta,
        placeholder_visible_ms: relFromOrigin(`wu_lane_${meta.lane}_placeholder`),
        real_data_ms: relFromOrigin(`wu_lane_${meta.lane}_real`),
    }));
}

export type WorkUnitCriticalPathReport = {
    captured_at: string;
    since_origin_ms: number | null;
    above_fold_coordinated_ms: number | null;
    lanes: WorkUnitLaneTimingRow[];
    bottleneck_lane: WorkUnitCriticalPathLane | null;
    alloy_marks: Record<string, number>;
};

export function reportWorkUnitCriticalPathLanes(): WorkUnitCriticalPathReport {
    const lanes = buildWorkUnitLaneTimingTable();
    let bottleneck_lane: WorkUnitCriticalPathLane | null = null;
    let maxReal = -1;
    for (const row of lanes) {
        if (row.real_data_ms != null && row.real_data_ms > maxReal) {
            maxReal = row.real_data_ms;
            bottleneck_lane = row.lane;
        }
    }
    const marks =
        typeof window !== "undefined" && window.__alloyPerf?.marks ? { ...window.__alloyPerf.marks } : {};
    const report: WorkUnitCriticalPathReport = {
        captured_at: new Date().toISOString(),
        since_origin_ms: relFromOrigin("wu_lane_shell_chrome_real"),
        above_fold_coordinated_ms: relFromOrigin("wu_lane_above_fold_coordinated"),
        lanes,
        bottleneck_lane,
        alloy_marks: marks,
    };
    if (typeof window !== "undefined") {
        console.info(TAG, report);
        emitAdminV2Perf(TAG, {
            phase: "lane_snapshot",
            bottleneck_lane,
            above_fold_coordinated_ms: report.above_fold_coordinated_ms,
            source: "network",
        });
    }
    return report;
}

declare global {
    interface Window {
        reportWorkUnitCriticalPathLanes?: typeof reportWorkUnitCriticalPathLanes;
    }
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    window.reportWorkUnitCriticalPathLanes = reportWorkUnitCriticalPathLanes;
}
