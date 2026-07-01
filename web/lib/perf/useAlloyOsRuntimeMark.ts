"use client";

import { useEffect, useRef } from "react";

import {
    perfAlloyOsRuntimeMark,
    type AdminV2PerfCommon,
    type AlloyOsRuntimeMark,
} from "@/lib/perf/adminV2PerfLog";
import { alloyPerfGet } from "@/lib/perf/alloyPerfGlobal";

/**
 * Emit an Alloy OS runtime lifecycle mark exactly once, the first time `active` becomes true.
 * Purely observational — never gates reveal, cache, or queue behavior. Dev/staging only
 * (the underlying emitter is gated to non-production).
 *
 * Pass a `resetKey` to allow the mark to fire again after a context change (e.g. new work unit).
 */
export function useAlloyOsRuntimeMarkOnce(
    mark: AlloyOsRuntimeMark,
    active: boolean,
    payload?: AdminV2PerfCommon & Record<string, unknown>,
    resetKey?: string | null,
): void {
    const firedKeyRef = useRef<string | null>(null);
    const startRef = useRef<number>(0);

    useEffect(() => {
        if (startRef.current === 0 && typeof performance !== "undefined") {
            startRef.current = performance.now();
        }
    }, []);

    useEffect(() => {
        const key = resetKey ?? "__static__";
        if (!active) return;
        if (firedKeyRef.current === key) return;
        firedKeyRef.current = key;
        const now = typeof performance !== "undefined" ? performance.now() : 0;
        const since =
            startRef.current > 0 && now > 0
                ? Math.round(now - startRef.current)
                : undefined;
        // Coherent timeline: elapsed since the shared work-unit drill-in start, so every mark reads
        // as `+Nms` from one entry t0 (e.g. `coordinated_reveal_ready +842ms`) instead of per-hook.
        const navStart = alloyPerfGet("work_unit_navigation_start") ?? alloyPerfGet("route_nav_start");
        const sinceNav =
            navStart != null && now > 0 ? Math.round(now - Number(navStart)) : undefined;
        perfAlloyOsRuntimeMark(mark, { ...payload, total_ms: since, since_nav_ms: sinceNav });
    }, [active, mark, payload, resetKey]);
}
