/**
 * Dev/staging opportunity drawer presentation gate diagnostics.
 * Filter: `[perf:drawer]`
 */

import { perfDevDetailEnabled, perfDrawer } from "@/lib/perf/perfNamespaceLog";

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
    if (!perfDevDetailEnabled()) return;
    perfDrawer("presentation_gate", {
        entity_type: "opportunity",
        entity_id: payload.opportunity_id,
        duration_ms: payload.reveal_delay_ms,
        count: payload.missing.length,
        source: "ui",
    });
}

export function logDrawerRawValueGuard(payload: {
    field: string;
    raw_value: string;
    suppressed: boolean;
}): void {
    if (!perfDevDetailEnabled()) return;
    perfDrawer("raw_value_guard", {
        source: "ui",
        detail: payload.field,
    });
}
