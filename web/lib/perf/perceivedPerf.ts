/**
 * Perceived-performance mark suite (Perceived Performance Sprint, Phase 1).
 *
 * A THIN wrapper over the existing perf-namespace logger (`emitPerf` /
 * `perfNamespaceLog.ts`) and the existing client marks global (`alloyPerfSet` /
 * `alloyPerfGlobal.ts`). It introduces NO new profiler, NO new cache, NO new runtime —
 * it only emits phase-boundary lines under the `[perf:perceived]` namespace and mirrors
 * an elapsed value onto `window.__alloyPerf.marks` so a single DevTools timeline spans
 * the operator path: acknowledgement → continuity → hold → reveal.
 *
 * Doctrine anchor: docs/sprints/07_2026/perceived-performance-sprint-audit.md (I1).
 *
 * Gating: dev/staging only, and killable via `NEXT_PUBLIC_PERF_PERCEIVED_MARKS=0`
 * (production is off regardless). Marks are boundary-only — never called in a render loop.
 *
 * PII: payloads flow through the existing `emitPerf` compactor, which drops any
 * non-whitelisted / operator-identifying key. Emit ids/keys only, never names.
 */

import { emitPerf, perfDevDetailEnabled } from "@/lib/perf/perfNamespaceLog";
import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";

/** The operator-path interactions this sprint measures. */
export type PerceivedInteraction =
    | "workspace_entry"
    | "work_unit_establish"
    | "pill_switch"
    | "queue_hold"
    | "queue_row_open"
    | "focus_panel_seed"
    | "focus_panel_resolved";

/** The perceived signal being marked (maps to the interaction budget). */
export type PerceivedSignal =
    | "intent" // pointer/keyboard intent registered (pre-commit)
    | "acknowledge" // selection/click visibly acknowledged
    | "hold_start" // prior surface/rows held (continuity engaged)
    | "hold_end" // held content replaced by fresh content
    | "reveal" // meaningful information established
    | "warm"; // a prefetch seam fired

export function perceivedMarksEnabled(): boolean {
    if (process.env.NEXT_PUBLIC_PERF_PERCEIVED_MARKS === "0") return false;
    return perfDevDetailEnabled();
}

function now(): number | null {
    if (typeof performance === "undefined") return null;
    return performance.now();
}

/**
 * Emit one perceived-performance boundary line + mirror an elapsed mark.
 *
 * `sinceIntentMs` (optional) lets a downstream signal report time elapsed since the
 * originating intent mark, so ack/reveal latency is readable directly in the log without
 * cross-referencing two lines.
 */
export function markPerceived(
    interaction: PerceivedInteraction,
    signal: PerceivedSignal,
    payload: Record<string, unknown> = {},
): number | null {
    if (!perceivedMarksEnabled()) return null;
    const t = now();
    emitPerf("perceived", `${interaction}:${signal}`, { interaction, signal, ...payload });
    if (t != null) {
        alloyPerfSet(`perceived_${interaction}_${signal}`, t);
    }
    return t;
}

/**
 * Convenience: mark an intent boundary and return a `settle(signal, extra?)` closure that
 * emits a follow-up boundary with `since_intent_ms` filled in.
 */
export function beginPerceived(
    interaction: PerceivedInteraction,
    payload: Record<string, unknown> = {},
): (signal: PerceivedSignal, extra?: Record<string, unknown>) => void {
    const startedAt = markPerceived(interaction, "intent", payload);
    return (signal, extra = {}) => {
        const t = now();
        const sinceIntentMs =
            startedAt != null && t != null ? Math.round(t - startedAt) : undefined;
        markPerceived(interaction, signal, { ...extra, since_intent_ms: sinceIntentMs });
    };
}
