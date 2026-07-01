/**
 * Card 0.2 — user-felt navigation/drawer responsiveness (client-side).
 *
 * Emits ONE structured line per primary-surface transition capturing the
 * "click → primary content visible" wall-time, so optimization work can measure
 * what the user feels (not just server route time from Card 0.1's `[ADMIN_PERF]`).
 *
 * Reuses the existing `window.__alloyPerf` marks and the `emitAdminV2Perf` emitter.
 * It is a pure observer: it reads marks already set by the nav/drawer paths and
 * emits a `[perf.surface.ready]` line — it sets no marks and changes no behavior.
 *
 * Gated by the SAME `ADMIN_PERF_TRACE` flag as the server-side `[ADMIN_PERF]`
 * tracing (Card 0.1) — one flag name, not a competing one. The server reads it
 * from `process.env.ADMIN_PERF_TRACE`; the browser cannot read a non-public env
 * var, so the client honors the same flag via localStorage. OFF by default.
 *   - enable (browser console):  localStorage.setItem("ADMIN_PERF_TRACE", "1")
 *   - disable:                   localStorage.removeItem("ADMIN_PERF_TRACE")
 *
 * To remove: delete this file and the `reportAdminV2SurfaceReady` call in
 * `lib/perf/alloyPerfGlobal.ts`.
 */

import { emitAdminV2Perf } from "@/lib/perf/adminV2PerfLog";

/** Maps a primary-paint "ready" mark to the user-action "start" mark(s) that precede it. */
const READY_MARK_CONFIG: Record<
    string,
    { startMarks: string[]; surface: string }
> = {
    // Work-unit drill-in: tile/queue/sidebar click → primary lane visible.
    work_unit_primary_lane_ready: {
        startMarks: ["work_unit_navigation_start", "route_nav_start"],
        surface: "workspace_work_unit",
    },
    // Department drill-in: tile/sidebar click → department surface ready.
    department_ready: {
        startMarks: ["route_nav_start", "work_unit_navigation_start"],
        surface: "workspace_department",
    },
    // Drawer-open: row click → drawer primary content visible.
    drawer_primary_ready: {
        startMarks: ["drawer_row_click_at", "drawer_open_start"],
        surface: "drawer",
    },
    drawer_primary_ready_at: {
        startMarks: ["drawer_row_click_at", "drawer_open_start"],
        surface: "drawer",
    },
};

/** Dedup: a single transition may fire its ready mark twice (lane vs shell). Keyed by start value. */
const lastEmittedStartBySurface: Record<string, number> = Object.create(null);

function isEnabled(): boolean {
    // Single source of truth: the `ADMIN_PERF_TRACE` flag (same name as the server gate).
    // The browser reads it from localStorage since non-public env vars are server-only.
    try {
        return (
            typeof window !== "undefined" &&
            window.localStorage?.getItem("ADMIN_PERF_TRACE") === "1"
        );
    } catch {
        // localStorage can throw (private mode / blocked storage) — treat as disabled.
        return false;
    }
}

/**
 * If `mark` is a primary-paint mark, emit the click→ready duration once.
 * No-op unless enabled. Never throws (a perf logger must not break app flow).
 */
export function reportAdminV2SurfaceReady(mark: string): void {
    try {
        if (!isEnabled()) return;
        const config = READY_MARK_CONFIG[mark];
        if (!config) return;

        const marks =
            typeof window !== "undefined" ? window.__alloyPerf?.marks : undefined;
        if (!marks) return;

        const readyAt = marks[mark];
        if (readyAt == null) return;

        let startMark: string | undefined;
        let startAt: number | undefined;
        for (const candidate of config.startMarks) {
            const value = marks[candidate];
            if (value != null) {
                startMark = candidate;
                startAt = value;
                break;
            }
        }
        if (startMark == null || startAt == null) return;

        // Emit once per transition: the start mark value is fresh for each navigation.
        if (lastEmittedStartBySurface[config.surface] === startAt) return;
        lastEmittedStartBySurface[config.surface] = startAt;

        const totalMs = Math.round(readyAt - startAt);
        if (totalMs < 0) return; // clock skew / out-of-order marks — skip.

        emitAdminV2Perf("[perf.surface.ready]", {
            surface: config.surface,
            phase: "click_to_primary_ready",
            start_mark: startMark,
            ready_mark: mark,
            total_ms: totalMs,
            source: "network",
        });
    } catch {
        // Observer must never disrupt mark-setting or the sidecar gate.
    }
}
