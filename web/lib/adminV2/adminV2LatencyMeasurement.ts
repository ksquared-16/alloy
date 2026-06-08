/**
 * AdminV2 reveal / prefetch / TTFB measurement — filter console:
 * `[workspace-reveal-gate]`, `[dept-reveal-gate]`, `[wu-reveal-gate]`,
 * `[drawer-primary-perf]`, `[wu-bootstrap-perf]`, `[dept-bootstrap-perf]`,
 * `[prefetch.adminv2]`, `[adminv2-latency]`.
 *
 * Dev: after navigation passes, run `reportAdminV2LatencySnapshot()` in the browser console.
 */

import { alloyPerfGet } from "@/lib/perf/alloyPerfGlobal";

export type AdminV2LatencySurface = "workspace" | "department" | "work_unit" | "drawer_primary";

export type AdminV2LatencyRow = {
    surface: AdminV2LatencySurface;
    cold_reveal_ms: number | null;
    warm_reveal_ms: number | null;
    prefetch_hit: string;
    ttfb_ms: number | null;
    payload_kb: string;
    slowest_internal_step: string;
    bottleneck: string;
};

const REVEAL_MARK_BY_SURFACE: Record<AdminV2LatencySurface, string> = {
    workspace: "workspace_reveal_above_fold_ready",
    department: "dept_reveal_above_fold_ready",
    work_unit: "wu_reveal_above_fold_ready",
    drawer_primary: "drawer_primary_ready",
};

const GATE_START_MARK: Record<AdminV2LatencySurface, string> = {
    workspace: "workspace_reveal_gate_start",
    department: "dept_reveal_gate_start",
    work_unit: "wu_reveal_gate_start",
    drawer_primary: "drawer_primary_start",
};

const BOOTSTRAP_RETURN_MARK: Record<AdminV2LatencySurface, string | null> = {
    workspace: null,
    department: "route_department_bootstrap_returned",
    work_unit: "route_work_unit_bootstrap_returned",
    drawer_primary: null,
};

const PAYLOAD_BYTES_MARK: Record<AdminV2LatencySurface, string | null> = {
    workspace: null,
    department: "department_bootstrap_payload_bytes",
    work_unit: "work_unit_bootstrap_payload_bytes",
    drawer_primary: "drawer_bootstrap_payload_bytes",
};

/** Template rows — fill via `reportAdminV2LatencySnapshot()`; do not invent timings in docs. */
export const ADMINV2_LATENCY_BOTTLENECK_TABLE: AdminV2LatencyRow[] = [
    {
        surface: "work_unit",
        cold_reveal_ms: null,
        warm_reveal_ms: null,
        prefetch_hit: "dept pointer / session TTL / inflight_join",
        ttfb_ms: null,
        payload_kb: "[wu-bootstrap-perf] or work_unit_bootstrap_payload_bytes mark",
        slowest_internal_step: "attention lane OR primary_lane_rows OR queue_summaries",
        bottleneck: "1 — WU operational-bootstrap TTFB",
    },
    {
        surface: "department",
        cold_reveal_ms: null,
        warm_reveal_ms: null,
        prefetch_hit: "workspace tile pointer / idle≤3 / TTL cache_hit",
        ttfb_ms: null,
        payload_kb: "[dept-bootstrap-perf]",
        slowest_internal_step: "batch queue summaries OR attention preview",
        bottleneck: "2 — Dept operational-bootstrap TTFB",
    },
    {
        surface: "drawer_primary",
        cold_reveal_ms: null,
        warm_reveal_ms: null,
        prefetch_hit: "row intent / drawer_primary in-flight map",
        ttfb_ms: null,
        payload_kb: "[drawer-primary-perf]",
        slowest_internal_step: "entity drawer_primary + shell compile",
        bottleneck: "3 — Drawer primary TTFB",
    },
    {
        surface: "workspace",
        cold_reveal_ms: null,
        warm_reveal_ms: null,
        prefetch_hit: "dept tile pointerdown",
        ttfb_ms: null,
        payload_kb: "departments + work-units (rollup background)",
        slowest_internal_step: "department list + tile stats",
        bottleneck: "4 — Workspace critical deps",
    },
];

export function readPerfMarkMs(mark: string): number | null {
    const v = alloyPerfGet(mark);
    return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

export function computeRevealWaitMs(surface: AdminV2LatencySurface): number | null {
    const end = readPerfMarkMs(REVEAL_MARK_BY_SURFACE[surface]);
    const start = readPerfMarkMs(GATE_START_MARK[surface]);
    if (end == null || start == null) return null;
    return Math.max(0, end - start);
}

export function computeBootstrapTtfbMs(surface: AdminV2LatencySurface): number | null {
    const bootstrapMark = BOOTSTRAP_RETURN_MARK[surface];
    const shellMark =
        surface === "work_unit"
            ? "route_work_unit_shell_visible"
            : surface === "department"
              ? "route_department_shell_visible"
              : null;
    if (!bootstrapMark || !shellMark) return null;
    return relMsFromMarks(bootstrapMark, shellMark);
}

function relMsFromMarks(endMark: string, startMark: string): number | null {
    const end = readPerfMarkMs(endMark);
    const start = readPerfMarkMs(startMark);
    if (end == null || start == null) return null;
    return Math.max(0, end - start);
}

export function formatPayloadKbFromMark(surface: AdminV2LatencySurface): string {
    const key = PAYLOAD_BYTES_MARK[surface];
    if (!key) return "—";
    const bytes = readPerfMarkMs(key);
    if (bytes == null || bytes <= 0) return "capture locally";
    return String(Math.round((bytes / 1024) * 10) / 10);
}

export type AdminV2LatencySnapshot = {
    captured_at: string;
    rows: AdminV2LatencyRow[];
    marks: Record<string, number>;
};

export function reportAdminV2LatencySnapshot(): AdminV2LatencySnapshot {
    const rows = ADMINV2_LATENCY_BOTTLENECK_TABLE.map((row) => {
        const reveal_ms = computeRevealWaitMs(row.surface);
        return {
            ...row,
            cold_reveal_ms: row.cold_reveal_ms ?? reveal_ms,
            warm_reveal_ms: row.warm_reveal_ms,
            ttfb_ms: row.ttfb_ms ?? computeBootstrapTtfbMs(row.surface),
            payload_kb:
                row.payload_kb.includes("capture") || row.payload_kb.includes("[")
                    ? formatPayloadKbFromMark(row.surface) !== "capture locally"
                        ? formatPayloadKbFromMark(row.surface)
                        : row.payload_kb
                    : row.payload_kb,
        };
    });
    const marks =
        typeof window !== "undefined" && window.__alloyPerf?.marks ? { ...window.__alloyPerf.marks } : {};
    const snapshot: AdminV2LatencySnapshot = {
        captured_at: new Date().toISOString(),
        rows,
        marks,
    };
    if (typeof window !== "undefined") {
        console.info("[adminv2-latency]", snapshot);
    }
    return snapshot;
}

declare global {
    interface Window {
        reportAdminV2LatencySnapshot?: typeof reportAdminV2LatencySnapshot;
    }
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    window.reportAdminV2LatencySnapshot = reportAdminV2LatencySnapshot;
}
