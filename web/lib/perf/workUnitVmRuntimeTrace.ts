/**
 * WU-VM-0 baseline measurement — cold open, warm open, pill switch, lane timings.
 * DevTools: `reportWorkUnitVmRuntimeBaseline()`
 */

import { alloyPerfGet, alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import { logWorkUnitVmRuntimeDiagnostic } from "@/lib/adminV2/viewModel/workUnit/workUnitVmRuntimeDiagnostics";

export type WorkUnitVmScenario = "cold_open" | "warm_open" | "pill_switch";

export type WorkUnitVmRuntimeBaseline = {
    captured_at: string;
    scenario: WorkUnitVmScenario | "unknown";
    since_navigation_ms: number | null;
    cold_open_ms: number | null;
    warm_open_ms: number | null;
    shell_ready_ms: number | null;
    summaries_ready_ms: number | null;
    queue_ready_ms: number | null;
    kpi_ready_ms: number | null;
    first_paint_ready_ms: number | null;
    actions_ready_ms: number | null;
    row_actions_ready_ms: number | null;
    right_rail_actions_ready_ms: number | null;
    pill_switch_ms: number | null;
    marks: Record<string, number>;
};

function originMs(): number | null {
    const o =
        alloyPerfGet("wu_vm_navigation_start") ??
        alloyPerfGet("work_unit_navigation_start") ??
        alloyPerfGet("work_unit_start");
    return o != null ? Number(o) : null;
}

function rel(mark: string): number | null {
    const t = alloyPerfGet(mark);
    const o = originMs();
    if (t == null || o == null) return null;
    return Math.round(Number(t) - o);
}

function inferScenario(marks: Record<string, number>): WorkUnitVmScenario | "unknown" {
    if (marks.wu_vm_pill_switch_start != null) return "pill_switch";
    if (marks.wu_vm_open_warm_cache != null) return "warm_open";
    if (marks.wu_vm_open_cold != null || marks.work_unit_start != null) return "cold_open";
    return "unknown";
}

export function markWorkUnitVmNavigationStart(extra?: Record<string, unknown>): void {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    alloyPerfSet("wu_vm_navigation_start", t);
    logWorkUnitVmRuntimeDiagnostic("wu_vm_open_start", { ms: Math.round(t), ...extra });
}

export function markWorkUnitVmOpenWarm(extra?: Record<string, unknown>): void {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    alloyPerfSet("wu_vm_open_warm_cache", t);
    logWorkUnitVmRuntimeDiagnostic("wu_vm_open_warm_cache", {
        since_navigation_ms: rel("wu_vm_open_warm_cache"),
        ...extra,
    });
}

export function markWorkUnitVmOpenCold(extra?: Record<string, unknown>): void {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    alloyPerfSet("wu_vm_open_cold", t);
    logWorkUnitVmRuntimeDiagnostic("wu_vm_open_cold", {
        since_navigation_ms: rel("wu_vm_open_cold"),
        ...extra,
    });
}

export function markWorkUnitVmBootstrapApply(extra?: Record<string, unknown>): void {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    alloyPerfSet("wu_vm_bootstrap_apply", t);
    logWorkUnitVmRuntimeDiagnostic("wu_vm_bootstrap_apply", {
        since_navigation_ms: rel("wu_vm_bootstrap_apply"),
        ...extra,
    });
}

export function markWorkUnitVmShellReady(extra?: Record<string, unknown>): void {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (alloyPerfGet("wu_vm_shell_ready") == null) alloyPerfSet("wu_vm_shell_ready", t);
    logWorkUnitVmRuntimeDiagnostic("wu_vm_shell_ready", {
        since_navigation_ms: rel("wu_vm_shell_ready"),
        ...extra,
    });
}

export function markWorkUnitVmSummariesReady(extra?: Record<string, unknown>): void {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (alloyPerfGet("wu_vm_summaries_ready") == null) alloyPerfSet("wu_vm_summaries_ready", t);
    logWorkUnitVmRuntimeDiagnostic("wu_vm_summaries_ready", {
        since_navigation_ms: rel("wu_vm_summaries_ready"),
        ...extra,
    });
}

export function markWorkUnitVmQueueReady(extra?: Record<string, unknown>): void {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (alloyPerfGet("wu_vm_queue_ready") == null) alloyPerfSet("wu_vm_queue_ready", t);
    logWorkUnitVmRuntimeDiagnostic("wu_vm_queue_ready", {
        since_navigation_ms: rel("wu_vm_queue_ready"),
        ...extra,
    });
}

export function markWorkUnitVmKpiReady(extra?: Record<string, unknown>): void {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (alloyPerfGet("wu_vm_kpi_ready") == null) alloyPerfSet("wu_vm_kpi_ready", t);
    logWorkUnitVmRuntimeDiagnostic("wu_vm_kpi_ready", {
        since_navigation_ms: rel("wu_vm_kpi_ready"),
        ...extra,
    });
}

export function markWorkUnitVmFirstPaintReady(extra?: Record<string, unknown>): void {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (alloyPerfGet("wu_vm_first_paint_ready") == null) alloyPerfSet("wu_vm_first_paint_ready", t);
    logWorkUnitVmRuntimeDiagnostic("wu_vm_first_paint_ready", {
        since_navigation_ms: rel("wu_vm_first_paint_ready"),
        ...extra,
    });
}

export function markWorkUnitVmRowActionsReady(extra?: Record<string, unknown>): void {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (alloyPerfGet("wu_vm_row_actions_ready") == null) alloyPerfSet("wu_vm_row_actions_ready", t);
    logWorkUnitVmRuntimeDiagnostic("wu_vm_row_actions_ready", {
        since_navigation_ms: rel("wu_vm_row_actions_ready"),
        ...extra,
    });
}

export function markWorkUnitVmRightRailActionsReady(extra?: Record<string, unknown>): void {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (alloyPerfGet("wu_vm_right_rail_actions_ready") == null)
        alloyPerfSet("wu_vm_right_rail_actions_ready", t);
    logWorkUnitVmRuntimeDiagnostic("wu_vm_right_rail_actions_ready", {
        since_navigation_ms: rel("wu_vm_right_rail_actions_ready"),
        ...extra,
    });
}

export function markWorkUnitVmActionsReady(extra?: Record<string, unknown>): void {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (alloyPerfGet("wu_vm_actions_ready") == null) alloyPerfSet("wu_vm_actions_ready", t);
    logWorkUnitVmRuntimeDiagnostic("wu_vm_actions_ready", {
        since_navigation_ms: rel("wu_vm_actions_ready"),
        ...extra,
    });
}

export function markWorkUnitVmPillSwitchStart(extra?: Record<string, unknown>): void {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    alloyPerfSet("wu_vm_pill_switch_start", t);
    logWorkUnitVmRuntimeDiagnostic("wu_vm_pill_switch_start", { ms: Math.round(t), ...extra });
}

export function markWorkUnitVmPillSwitchCacheHit(extra?: Record<string, unknown>): void {
    logWorkUnitVmRuntimeDiagnostic("wu_vm_pill_switch_cache_hit", {
        since_pill_switch_ms:
            alloyPerfGet("wu_vm_pill_switch_start") != null ?
                Math.round(tNow() - Number(alloyPerfGet("wu_vm_pill_switch_start")))
            :   null,
        ...extra,
    });
}

export function markWorkUnitVmPillSwitchCacheMissHoldCurrent(extra?: Record<string, unknown>): void {
    logWorkUnitVmRuntimeDiagnostic("wu_vm_pill_switch_cache_miss_hold_current", {
        since_pill_switch_ms:
            alloyPerfGet("wu_vm_pill_switch_start") != null ?
                Math.round(tNow() - Number(alloyPerfGet("wu_vm_pill_switch_start")))
            :   null,
        ...extra,
    });
}

export function markWorkUnitVmPillSwitchCommitted(extra?: Record<string, unknown>): void {
    const t = tNow();
    alloyPerfSet("wu_vm_pill_switch_committed", t);
    const start = alloyPerfGet("wu_vm_pill_switch_start");
    logWorkUnitVmRuntimeDiagnostic("wu_vm_pill_switch_committed", {
        pill_switch_ms: start != null ? Math.round(t - Number(start)) : null,
        ...extra,
    });
}

export function markWorkUnitVmPillPrefetchStart(extra?: Record<string, unknown>): void {
    logWorkUnitVmRuntimeDiagnostic("wu_vm_pill_prefetch_start", extra ?? {});
}

export function markWorkUnitVmPillPrefetchReady(extra?: Record<string, unknown>): void {
    logWorkUnitVmRuntimeDiagnostic("wu_vm_pill_prefetch_ready", extra ?? {});
}

export function markWorkUnitVmPillSwitchApply(extra?: Record<string, unknown>): void {
    const t = tNow();
    alloyPerfSet("wu_vm_pill_switch_apply", t);
    const start = alloyPerfGet("wu_vm_pill_switch_start");
    logWorkUnitVmRuntimeDiagnostic("wu_vm_pill_switch_apply", {
        pill_switch_ms: start != null ? Math.round(t - Number(start)) : null,
        ...extra,
    });
}

function tNow(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function reportWorkUnitVmRuntimeBaseline(): WorkUnitVmRuntimeBaseline {
    const marks =
        typeof window !== "undefined" && window.__alloyPerf?.marks ?
            { ...window.__alloyPerf.marks }
        :   {};
    const report: WorkUnitVmRuntimeBaseline = {
        captured_at: new Date().toISOString(),
        scenario: inferScenario(marks),
        since_navigation_ms: rel("wu_vm_first_paint_ready") ?? rel("wu_vm_shell_ready"),
        cold_open_ms: rel("wu_vm_open_cold"),
        warm_open_ms: rel("wu_vm_open_warm_cache"),
        shell_ready_ms: rel("wu_vm_shell_ready") ?? rel("work_unit_shell_ready"),
        summaries_ready_ms: rel("wu_vm_summaries_ready") ?? rel("wu_reveal_summaries_ready"),
        queue_ready_ms: rel("wu_vm_queue_ready") ?? rel("queue_tab_rows_ready"),
        kpi_ready_ms: rel("wu_vm_kpi_ready") ?? rel("wu_lane_kpi_or_summary_real"),
        first_paint_ready_ms: rel("wu_vm_first_paint_ready") ?? rel("wu_lane_above_fold_coordinated"),
        actions_ready_ms: rel("wu_vm_actions_ready"),
        row_actions_ready_ms: rel("wu_vm_row_actions_ready"),
        right_rail_actions_ready_ms: rel("wu_vm_right_rail_actions_ready"),
        pill_switch_ms:
            marks.wu_vm_pill_switch_start != null && marks.wu_vm_pill_switch_apply != null ?
                Math.round(Number(marks.wu_vm_pill_switch_apply) - Number(marks.wu_vm_pill_switch_start))
            :   null,
        marks,
    };
    if (typeof window !== "undefined") {
        console.info("[wu_vm_runtime_baseline]", report);
    }
    return report;
}

declare global {
    interface Window {
        reportWorkUnitVmRuntimeBaseline?: typeof reportWorkUnitVmRuntimeBaseline;
    }
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    window.reportWorkUnitVmRuntimeBaseline = reportWorkUnitVmRuntimeBaseline;
}
