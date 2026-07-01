/**
 * AdminV2 speed sprint — aggregates existing perf marks into one report.
 * Capture locally: open surface → run `reportAdminV2SpeedSprint()` in DevTools console.
 */

import { alloyPerfGet, alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import { emitAdminV2Perf } from "@/lib/perf/adminV2PerfLog";
import { buildWorkUnitLaneTimingTable } from "@/lib/perf/workUnitCriticalPathTrace";

const TAG = "[perf]";

export type SpeedSprintSurface = "work_unit" | "drawer_opportunity" | "department" | "workspace";

export type SpeedSprintTimingRow = {
    surface: SpeedSprintSurface;
    shell_visible_ms: number | null;
    bootstrap_or_primary_ms: number | null;
    above_fold_stable_ms: number | null;
    hydration_complete_ms: number | null;
    queue_items_fetch_ms: number | null;
    post_shell_fetch_count: number | null;
    bootstrap_payload_bytes: number | null;
    notes: string[];
};

function relMs(mark: string, originMark: string): number | null {
    const t = alloyPerfGet(mark);
    const o = alloyPerfGet(originMark);
    if (t == null || o == null) return null;
    return Math.round(t - o);
}

function absMs(mark: string): number | null {
    const t = alloyPerfGet(mark);
    return t != null ? Math.round(t) : null;
}

export function recordBootstrapPayloadBytes(surface: SpeedSprintSurface, bytes: number): void {
    const key =
        surface === "work_unit"
            ? "work_unit_bootstrap_payload_bytes"
            : surface === "drawer_opportunity"
              ? "drawer_bootstrap_payload_bytes"
              : `${surface}_bootstrap_payload_bytes`;
    if (typeof window !== "undefined") {
        alloyPerfSet(key, bytes);
    }
    emitAdminV2Perf(TAG, { surface, phase: "bootstrap_payload_bytes", payload_bytes: bytes, source: "network" });
}

/** Work-unit row from route + wu-route-perf marks. */
export function buildWorkUnitSpeedSprintRow(): SpeedSprintTimingRow {
    const shell = absMs("route_work_unit_shell_visible");
    const notes: string[] = [];
    const queueStart = alloyPerfGet("work_unit_queue_rows_request_start");
    const queueReady = alloyPerfGet("work_unit_queue_rows_ready") ?? alloyPerfGet("queue_rows_ready");
    let queueItemsMs: number | null = null;
    if (queueStart != null && queueReady != null) {
        queueItemsMs = Math.round(queueReady - queueStart);
    }

    return {
        surface: "work_unit",
        shell_visible_ms: shell,
        bootstrap_or_primary_ms: relMs("route_work_unit_bootstrap_returned", "route_work_unit_shell_visible"),
        above_fold_stable_ms: relMs("route_work_unit_first_above_fold_stable", "route_work_unit_shell_visible"),
        hydration_complete_ms: relMs("route_work_unit_hydration_complete", "route_work_unit_shell_visible"),
        queue_items_fetch_ms: queueItemsMs,
        post_shell_fetch_count: Number(alloyPerfGet("route_work_unit_post_shell_fetch_count") ?? 0) || null,
        bootstrap_payload_bytes: Number(alloyPerfGet("work_unit_bootstrap_payload_bytes") ?? 0) || null,
        notes,
    };
}

/** Opportunity drawer from drawer.first_paint + alloy marks. */
export function buildDrawerOpportunitySpeedSprintRow(): SpeedSprintTimingRow {
    return {
        surface: "drawer_opportunity",
        shell_visible_ms: absMs("drawer_visible_ready"),
        bootstrap_or_primary_ms:
            relMs("drawer_primary_ready", "drawer_visible_ready") ??
            relMs("drawer_primary_ready_at", "drawer_visible_ready"),
        above_fold_stable_ms: relMs("drawer_above_fold_stable_at", "drawer_visible_ready"),
        hydration_complete_ms: absMs("drawer_full_ready"),
        queue_items_fetch_ms: null,
        post_shell_fetch_count: Number(alloyPerfGet("drawer_post_open_fetch_count") ?? 0) || null,
        bootstrap_payload_bytes: Number(alloyPerfGet("drawer_bootstrap_payload_bytes") ?? 0) || null,
        notes: [],
    };
}

export function buildWorkspaceSpeedSprintRow(): SpeedSprintTimingRow {
    return {
        surface: "workspace",
        shell_visible_ms: absMs("route_workspace_shell_visible") ?? absMs("workspace_start"),
        bootstrap_or_primary_ms: relMs("workspace_ready", "workspace_start"),
        above_fold_stable_ms: null,
        hydration_complete_ms: null,
        queue_items_fetch_ms: null,
        post_shell_fetch_count: Number(alloyPerfGet("route_workspace_post_shell_fetch_count") ?? 0) || null,
        bootstrap_payload_bytes: null,
        notes: [],
    };
}

export function buildDepartmentSpeedSprintRow(): SpeedSprintTimingRow {
    return {
        surface: "department",
        shell_visible_ms: absMs("route_department_shell_visible") ?? absMs("department_ready"),
        bootstrap_or_primary_ms: relMs("route_department_bootstrap_returned", "route_department_shell_visible"),
        above_fold_stable_ms: relMs("route_department_first_above_fold_stable", "route_department_shell_visible"),
        hydration_complete_ms: relMs("route_department_hydration_complete", "route_department_shell_visible"),
        queue_items_fetch_ms: null,
        post_shell_fetch_count: Number(alloyPerfGet("route_department_post_shell_fetch_count") ?? 0) || null,
        bootstrap_payload_bytes: null,
        notes: [],
    };
}

export type SpeedSprintReport = {
    captured_at: string;
    rows: SpeedSprintTimingRow[];
    work_unit_lanes?: ReturnType<typeof buildWorkUnitLaneTimingTable>;
    alloy_marks: Record<string, number>;
};

export function reportAdminV2SpeedSprint(extra?: Partial<SpeedSprintTimingRow>): SpeedSprintReport {
    const rows = [
        buildWorkUnitSpeedSprintRow(),
        buildDrawerOpportunitySpeedSprintRow(),
        buildDepartmentSpeedSprintRow(),
        buildWorkspaceSpeedSprintRow(),
    ];
    if (extra?.surface) {
        const idx = rows.findIndex((r) => r.surface === extra.surface);
        if (idx >= 0) rows[idx] = { ...rows[idx]!, ...extra };
    }
    const marks =
        typeof window !== "undefined" && window.__alloyPerf?.marks
            ? { ...window.__alloyPerf.marks }
            : {};
    const report: SpeedSprintReport = {
        captured_at: new Date().toISOString(),
        rows,
        work_unit_lanes: buildWorkUnitLaneTimingTable(),
        alloy_marks: marks,
    };
    if (typeof window !== "undefined") {
        console.info(TAG, report);
        emitAdminV2Perf(TAG, { phase: "snapshot", mark_count: Object.keys(marks).length, source: "network" });
    }
    return report;
}

declare global {
    interface Window {
        reportAdminV2SpeedSprint?: typeof reportAdminV2SpeedSprint;
    }
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    window.reportAdminV2SpeedSprint = reportAdminV2SpeedSprint;
}
