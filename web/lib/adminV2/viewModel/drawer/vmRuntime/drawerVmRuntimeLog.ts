/**
 * Client + server drawer VM runtime perf marks.
 * Filter: `[perf:drawer]`
 */

import { perfDebugTraceEnabled, perfDrawer } from "@/lib/perf/perfNamespaceLog";

export type DrawerVmRuntimeLogEvent =
    | "mounted"
    | "cold_fetch_start"
    | "cold_fetch_ready"
    | "payload_ready"
    | "swap_cache_hit"
    | "swap_fetch_start"
    | "swap_committed"
    | "swap_hold_current"
    | "legacy_fetch_blocked"
    | "related_prefetch_start"
    | "related_prefetch_ready"
    | "related_prefetch_error"
    | "background_enrich_start"
    | "background_enrich_ready"
    | "background_enrich_error"
    | "tab_switch"
    | "swap_hold"
    | "cold_fetch_error"
    /** @deprecated use cold_fetch_start — no-op (render-loop noise) */
    | "render"
    /** @deprecated use cold_fetch_start */
    | "cold_fetch";

function entityFields(payload: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (payload.opportunity_id != null) {
        out.entity_type = "opportunity";
        out.entity_id = String(payload.opportunity_id);
    } else if (payload.person_id != null) {
        out.entity_type = "person";
        out.entity_id = String(payload.person_id);
    } else if (payload.child_person_id != null) {
        out.entity_type = "child";
        out.entity_id = String(payload.child_person_id);
    }
    if (payload.runtime != null) out.runtime = payload.runtime;
    if (payload.tab != null) out.tab = payload.tab;
    if (payload.duration_ms != null) out.duration_ms = payload.duration_ms;
    if (payload.cache_hit != null) out.cache_hit = payload.cache_hit;
    if (payload.source != null) out.source = payload.source;
    if (payload.warm != null) out.warm = payload.warm;
    if (payload.cold != null) out.cold = payload.cold;
    return out;
}

export function logDrawerVmRuntime(
    event: DrawerVmRuntimeLogEvent,
    payload: Record<string, unknown> = {}
): void {
    if (event === "render") return;
    const phase = event;
    if (event === "swap_cache_hit") {
        perfDrawer(phase, { ...entityFields(payload), cache_hit: true, source: "cache" });
        return;
    }
    if (event === "cold_fetch_start" || event === "swap_fetch_start") {
        perfDrawer(phase, { ...entityFields(payload), source: "network", cold: true });
        return;
    }
    if (event === "cold_fetch_ready" || event === "swap_committed" || event === "payload_ready") {
        perfDrawer(phase, { ...entityFields(payload), source: "network" });
        return;
    }
    if (event.startsWith("related_prefetch") || event.startsWith("background_enrich")) {
        perfDrawer(phase, { ...entityFields(payload), source: "prefetch" });
        return;
    }
    perfDrawer(phase, entityFields(payload));
}

/** Vercel/server — VM API compose and cache only (not UI flicker). */
export function logDrawerVmRuntimeServer(
    event: "compose_start" | "compose_ok" | "compose_skip" | "compose_error",
    payload: Record<string, unknown>
): void {
    const entityId =
        payload.opportunity_id ?? payload.person_id ?? payload.child_id ?? payload.entity_id ?? null;
    perfDrawer(`vm_compose_${event.replace("compose_", "")}`, {
        entity_type: payload.entity_type ?? (payload.opportunity_id != null ? "opportunity" : undefined),
        entity_id: entityId != null ? String(entityId) : undefined,
        duration_ms: payload.duration_ms ?? payload.compose_ms ?? payload.total_ms,
        cache_hit: payload.cache_hit,
        source: payload.source ?? "network",
        status: payload.status,
    });
}
