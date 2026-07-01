/**
 * Dev/staging perf marks for workspace continuity sprint (Pass 2).
 * Filter console: `[perf:workspace]` / `[perf:work-unit]` / `[perf:prefetch]`
 */

import { perfPrefetch, perfRoot, perfWorkUnit } from "@/lib/perf/perfNamespaceLog";

export function markWorkspaceRootRestore(source: "cache" | "memory" | "network", detail: Record<string, unknown> = {}): void {
    perfRoot("root_restore", {
        client_cache_hit: source === "cache" || source === "memory",
        source,
        ...detail,
    });
}

export function markWorkspaceTileClickIntent(detail: Record<string, unknown> = {}): void {
    perfWorkUnit("tile_click_intent", detail);
}

export function markWorkUnitTransitionStart(detail: Record<string, unknown> = {}): void {
    perfWorkUnit("transition_start", detail);
}

export function markWorkUnitTransitionReady(detail: Record<string, unknown> = {}): void {
    perfWorkUnit("transition_ready", detail);
}

export function markWorkUnitBootstrapCache(outcome: "hit" | "miss", detail: Record<string, unknown> = {}): void {
    perfWorkUnit(`bootstrap_cache_${outcome}`, {
        client_cache_hit: outcome === "hit",
        ...detail,
    });
}

export function markKpiPillClick(detail: Record<string, unknown> = {}): void {
    perfWorkUnit("kpi_pill_click", detail);
}

export function markKpiPillCache(outcome: "hit" | "miss", detail: Record<string, unknown> = {}): void {
    perfWorkUnit(`kpi_pill_cache_${outcome}`, {
        client_cache_hit: outcome === "hit",
        ...detail,
    });
}

export function markDrawerLinkedPrewarmScheduled(detail: Record<string, unknown> = {}): void {
    perfPrefetch("drawer_linked_prewarm_scheduled", detail);
}

export function markDrawerLinkedPrewarmCache(outcome: "hit" | "miss", detail: Record<string, unknown> = {}): void {
    perfPrefetch(`drawer_linked_prewarm_${outcome}`, {
        cache_hit: outcome === "hit",
        ...detail,
    });
}

export function markPersonDrawerOpenSource(
    source: "prewarm" | "cache" | "network",
    detail: Record<string, unknown> = {},
): void {
    perfPrefetch("person_drawer_open_source", { open_source: source, ...detail });
}
