/**
 * Client timing marks on `window.__alloyPerf` for debugging (no default UI; use DevTools / Performance).
 * Active in development or when overlay is explicitly enabled (URL / localStorage).
 */

import { clearAdminV2PrimarySurfacePendingFromMark } from "@/lib/perf/adminV2PrimarySurfaceGate";

export const ALLOY_PERF_TICK_EVENT = "alloy-perf-tick";

const PRIMARY_SURFACE_CLEAR_MARKS = new Set([
    "work_unit_primary_lane_ready",
    "department_ready",
    "drawer_primary_ready",
    "drawer_primary_ready_at",
]);

declare global {
    interface Window {
        __alloyPerf?: AlloyPerfGlobal;
    }
}

export type AlloyPerfGlobal = {
    marks: Record<string, number>;
    set: (name: string, value: number) => void;
    get: (name: string) => number | undefined;
};

export function ensureAlloyPerf(): AlloyPerfGlobal | null {
    if (typeof window === "undefined") return null;
    if (!window.__alloyPerf) {
        window.__alloyPerf = {
            marks: Object.create(null) as Record<string, number>,
            set(name: string, value: number) {
                this.marks[name] = value;
                window.dispatchEvent(new Event(ALLOY_PERF_TICK_EVENT));
            },
            get(name: string) {
                return this.marks[name];
            },
        };
    }
    return window.__alloyPerf;
}

/** Convenience: set mark if perf API is available (client-only). */
export function alloyPerfSet(name: string, value: number): void {
    ensureAlloyPerf()?.set(name, value);
    if (PRIMARY_SURFACE_CLEAR_MARKS.has(name)) {
        clearAdminV2PrimarySurfacePendingFromMark(name);
    }
}

export function alloyPerfGet(name: string): number | undefined {
    return ensureAlloyPerf()?.get(name);
}

/** True while a workspace drill-in (dept tile, queue row) is in flight — defer background polls. */
export function isAdminV2OperNavigationActive(maxAgeMs = 10_000): boolean {
    if (typeof window === "undefined" || typeof performance === "undefined") return false;
    const nav = alloyPerfGet("work_unit_navigation_start");
    if (nav == null) return false;
    return performance.now() - nav < maxAgeMs;
}

/**
 * True from WU drill-in until primary lane / bootstrap ready marks — shell sidecars should not compete.
 */
export function isAdminV2WuPrimaryPaintPending(maxAgeMs = 20_000): boolean {
    if (typeof window === "undefined" || typeof performance === "undefined") return false;
    const nav = alloyPerfGet("work_unit_navigation_start");
    if (nav == null) return false;
    if (performance.now() - nav >= maxAgeMs) return false;
    const primary = alloyPerfGet("work_unit_primary_lane_ready");
    const bootstrap = alloyPerfGet("work_unit_bootstrap_ready");
    if (primary != null || bootstrap != null) return false;
    return true;
}
