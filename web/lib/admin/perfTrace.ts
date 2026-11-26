/**
 * Lightweight, removable admin perf tracing for hot read routes.
 *
 * Phase 0 instrumentation (see docs/sprints/archive/06_2026/adminv2_runtime_navigation_performance_execution_plan.md,
 * Card 0.1). Captures server handler wall-time per request so optimization work has
 * before/after proof. Mirrors the existing `[BOOK_V2_PERF]` structured-log style
 * (key=value fields, performance.now() with Date.now() fallback).
 *
 * OFF by default. Enable with `ADMIN_PERF_TRACE=1` (e.g. `ADMIN_PERF_TRACE=1 npm run dev`).
 * When disabled, callers should short-circuit so there is zero added overhead.
 *
 * To remove: delete this file and the thin GET wrappers that import it.
 */

/** True only when ADMIN_PERF_TRACE=1, so tracing is opt-in and produces no production noise. */
export function adminPerfEnabled(): boolean {
    return process.env.ADMIN_PERF_TRACE === "1";
}

/** High-resolution clock with a safe fallback, matching the book-v2 perf pattern. */
export function adminPerfNow(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

type AdminPerfFields = {
    /** Logical route name, e.g. "entity" | "jobs" | "related". */
    route: string;
    /** HTTP status of the response that was returned. */
    status: number;
    /** Start timestamp from adminPerfNow(). */
    t0: number;
    /** Optional context labels (entity type, id, etc.). */
    [key: string]: string | number | undefined;
};

/**
 * Emit one structured `[ADMIN_PERF]` line. No-op unless ADMIN_PERF_TRACE=1.
 * Computes total_ms from t0 at call time.
 */
export function logAdminPerf(fields: AdminPerfFields): void {
    if (!adminPerfEnabled()) return;
    const { t0, ...rest } = fields;
    const total_ms = Math.round(adminPerfNow() - t0);
    const parts = Object.entries(rest)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${k}=${v}`);
    parts.push(`total_ms=${total_ms}`);
    console.info(`[ADMIN_PERF] ${parts.join(" ")}`);
}
