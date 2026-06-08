/**
 * Dev/staging opportunity drawer presentation gate diagnostics.
 * Filter: `[perf.drawer.presentation_gate]` | `[perf.drawer.raw_value_guard]`
 */

const PERF_ENABLED = process.env.NODE_ENV === "development" || process.env.VITEST === "true";

export function logDrawerPresentationGate(payload: {
    opportunity_id: string;
    ready: boolean;
    missing: string[];
    reveal_delay_ms?: number;
    raw_value_suppressed?: string[];
    skeleton_sections?: string[];
    header_actions_ready?: boolean;
    header_actions_skeleton?: boolean;
}): void {
    if (!PERF_ENABLED) return;
    console.info("[perf.drawer.presentation_gate]", payload);
}

export function logDrawerRawValueGuard(payload: {
    field: string;
    raw_value: string;
    suppressed: boolean;
}): void {
    if (!PERF_ENABLED) return;
    console.info("[perf.drawer.raw_value_guard]", payload);
}
