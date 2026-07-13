/**
 * Workspace navigation request-graph + timing recorder (Trust Closure, Commit 1).
 *
 * The pre-PRV2 critical-path lane trace (`workUnitCriticalPathTrace.ts`) instrumented an
 * `operational-bootstrap` architecture whose lane marks (`markWorkUnitLane*`) now have ZERO
 * callers — the PRV2 runtime (`useWorkUnitSurfaceRuntime`) fetches its resources through
 * `dedupeAdminFetch` and emits only `markPerceived` boundaries. That leaves the current runtime
 * un-measurable against the sprint's §3/§15 baseline (nav mode, request count, duplicate count,
 * cache outcome, coherent-content timing).
 *
 * This recorder closes that gap WITHOUT adding a profiler or a second cache: it buckets the
 * admin fetches issued during a single Work Unit navigation into one record, classifies the
 * navigation mode, stamps the four timing markers, and exposes a dev/staging baseline dump
 * (`window.__alloyWorkspaceBaseline()`) the operator can copy after each scenario. It reuses the
 * existing `emitPerf` namespace logger and `alloyPerf` window marks — no new runtime surface.
 *
 * Gating: dev/staging only, same kill switch as the perceived marks
 * (`NEXT_PUBLIC_PERF_PERCEIVED_MARKS=0`). In-memory only; URLs stay client-side and are never
 * shipped to a server. The `emitPerf` lines carry counts/timings only, never full URLs.
 */

import { emitPerf, perfDevDetailEnabled } from "@/lib/perf/perfNamespaceLog";
import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";

/** How the operator arrived at this Work Unit (sprint §15 navigation mode). */
export type WorkspaceNavMode = "cold" | "warm" | "prefetched" | "return";

/** Where a resource read was answered from (sprint §15 cache outcome). */
export type WorkspaceCacheOutcome = "hit" | "stale_hit" | "miss" | "dedup_inflight";

/** The composition milestones a navigation passes through (sprint §3 timing markers). */
export type WorkspaceNavSignal = "shell_visible" | "coherent_content" | "interaction_ready";

/** One admin request observed during a navigation window. */
export type WorkspaceRequestRecord = {
    url: string;
    startedAtMs: number;
    durationMs: number | null;
    /** Joined a GET already in flight for the same URL (coalesced, no new network hit). */
    joinedInflight: boolean;
    /** Served from a TTL response cache (`dedupeAdminFetchWithTtl`). */
    ttlCacheHit: boolean;
    ok: boolean | null;
};

export type WorkspaceNavRecord = {
    navId: number;
    workUnitSlug: string | null;
    mode: WorkspaceNavMode;
    startedAtMs: number;
    /** Timing markers, ms since nav start (null until reached). */
    markers: Record<WorkspaceNavSignal, number | null>;
    requests: WorkspaceRequestRecord[];
    cacheOutcomes: Record<WorkspaceCacheOutcome, number>;
    settled: boolean;
};

function enabled(): boolean {
    if (typeof window === "undefined") return false;
    if (process.env.NEXT_PUBLIC_PERF_PERCEIVED_MARKS === "0") return false;
    return perfDevDetailEnabled();
}

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

const RING_LIMIT = 24;
let navCounter = 0;
let current: WorkspaceNavRecord | null = null;
const history: WorkspaceNavRecord[] = [];

function emptyOutcomes(): Record<WorkspaceCacheOutcome, number> {
    return { hit: 0, stale_hit: 0, miss: 0, dedup_inflight: 0 };
}

/**
 * Open a new navigation record. Idempotent per (slug, mode) so a re-render that re-runs the
 * begin effect does not split one navigation into two records; a genuinely new slug or mode
 * rotates the record and retires the prior one to the ring buffer.
 */
export function beginWorkspaceNav(
    workUnitSlug: string | null,
    mode: WorkspaceNavMode,
    /** True nav origin (e.g. the drill-in click mark) so shell/coherent time from intent, not mount. */
    startedAtMs?: number,
): void {
    if (!enabled()) return;
    if (current && current.workUnitSlug === workUnitSlug && current.mode === mode && !current.settled) {
        return;
    }
    if (current) {
        history.push(current);
        while (history.length > RING_LIMIT) history.shift();
    }
    navCounter += 1;
    current = {
        navId: navCounter,
        workUnitSlug,
        mode,
        startedAtMs: typeof startedAtMs === "number" && startedAtMs > 0 ? startedAtMs : nowMs(),
        markers: { shell_visible: null, coherent_content: null, interaction_ready: null },
        requests: [],
        cacheOutcomes: emptyOutcomes(),
        settled: false,
    };
    emitPerf("workspace_nav", "begin", { nav_id: current.navId, mode, slug_present: workUnitSlug != null });
    alloyPerfSet("workspace_nav_start", current.startedAtMs);
}

/** Record one admin request against the active navigation (no-op when none is open). */
export function recordWorkspaceRequest(rec: {
    url: string;
    startedAtMs: number;
    durationMs: number | null;
    joinedInflight: boolean;
    ttlCacheHit: boolean;
    ok: boolean | null;
}): void {
    if (!enabled() || !current) return;
    current.requests.push({ ...rec });
}

/** Record a resource-cache outcome (emitted by the workspace session cache in Commit 2). */
export function recordWorkspaceCacheOutcome(resource: string, outcome: WorkspaceCacheOutcome): void {
    if (!enabled() || !current) return;
    current.cacheOutcomes[outcome] += 1;
    emitPerf("workspace_nav", "cache", { nav_id: current.navId, resource, outcome });
}

/**
 * Stamp a composition milestone. First-write-wins per navigation so a re-render cannot move a
 * marker backward. `coherent_content` is the atomic-reveal point (sprint §9): shell + primary
 * content established as one composition, not a per-region reveal.
 */
export function markWorkspaceNavSignal(signal: WorkspaceNavSignal): void {
    if (!enabled() || !current) return;
    if (current.markers[signal] != null) return;
    const rel = Math.round(nowMs() - current.startedAtMs);
    current.markers[signal] = rel;
    if (signal === "interaction_ready") current.settled = true;
    emitPerf("workspace_nav", signal, { nav_id: current.navId, since_nav_start_ms: rel });
    alloyPerfSet(`workspace_nav_${signal}`, nowMs());
}

/** Duplicate = a URL requested more than once within the same navigation window. */
function duplicateRequestCount(rec: WorkspaceNavRecord): number {
    const seen = new Map<string, number>();
    for (const r of rec.requests) seen.set(r.url, (seen.get(r.url) ?? 0) + 1);
    let dupes = 0;
    for (const count of seen.values()) if (count > 1) dupes += count - 1;
    return dupes;
}

export type WorkspaceNavBaselineRow = {
    nav_id: number;
    work_unit_slug: string | null;
    mode: WorkspaceNavMode;
    shell_visible_ms: number | null;
    coherent_content_ms: number | null;
    interaction_ready_ms: number | null;
    request_count: number;
    duplicate_request_count: number;
    inflight_join_count: number;
    ttl_cache_hit_count: number;
    cache_outcomes: Record<WorkspaceCacheOutcome, number>;
};

function toRow(rec: WorkspaceNavRecord): WorkspaceNavBaselineRow {
    return {
        nav_id: rec.navId,
        work_unit_slug: rec.workUnitSlug,
        mode: rec.mode,
        shell_visible_ms: rec.markers.shell_visible,
        coherent_content_ms: rec.markers.coherent_content,
        interaction_ready_ms: rec.markers.interaction_ready,
        request_count: rec.requests.length,
        duplicate_request_count: duplicateRequestCount(rec),
        inflight_join_count: rec.requests.filter((r) => r.joinedInflight).length,
        ttl_cache_hit_count: rec.requests.filter((r) => r.ttlCacheHit).length,
        cache_outcomes: { ...rec.cacheOutcomes },
    };
}

/** The §3/§15 baseline table across recent navigations (newest last), plus the live one. */
export function reportWorkspaceBaseline(): {
    captured_at: string;
    navigations: WorkspaceNavBaselineRow[];
    current: WorkspaceNavBaselineRow | null;
} {
    const report = {
        captured_at: new Date().toISOString(),
        navigations: history.map(toRow),
        current: current ? toRow(current) : null,
    };
    if (typeof console !== "undefined") console.table([...report.navigations, ...(report.current ? [report.current] : [])]);
    return report;
}

/** Per-request detail for the most recent navigation — the request waterfall (sprint §4). */
export function reportWorkspaceNavRequests(navId?: number): WorkspaceRequestRecord[] {
    const rec = navId != null ? history.find((h) => h.navId === navId) ?? (current?.navId === navId ? current : null) : current;
    return rec ? rec.requests.map((r) => ({ ...r })) : [];
}

export function resetWorkspaceNavGraphForTests(): void {
    navCounter = 0;
    current = null;
    history.length = 0;
}

declare global {
    interface Window {
        __alloyWorkspaceBaseline?: typeof reportWorkspaceBaseline;
        __alloyWorkspaceNavRequests?: typeof reportWorkspaceNavRequests;
    }
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    window.__alloyWorkspaceBaseline = reportWorkspaceBaseline;
    window.__alloyWorkspaceNavRequests = reportWorkspaceNavRequests;
}
