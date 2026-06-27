/**
 * Standardized performance log namespaces for AdminV2 runtime audit work.
 * Filter console: `[perf]`, `[perf:drawer]`, `[perf:queue]`, `[perf:work-unit]`,
 * `[perf:cache]`, `[perf:prefetch]`, `[perf:save]`.
 *
 * Emits phase-boundary lines only — no render-loop noise. Payloads are compact and
 * exclude operator/PII fields (names, emails, full records, raw payloads).
 */

export type PerfNamespace =
    | "drawer"
    | "queue"
    | "work-unit"
    | "cache"
    | "prefetch"
    | "save"
    | "settings"
    | "intent"
    | "section";

const BLOCKED_KEYS = new Set([
    "email",
    "phone",
    "name",
    "display_name",
    "first_name",
    "last_name",
    "childNames",
    "record",
    "payload",
    "json",
    "body",
    "rows",
    "items",
    "inquiryChildrenSample",
    "structural_mismatches",
    "scalar_warnings",
    "structural_improvements",
    "missing",
    "blockingSections",
    "rowJson",
    "recordContext",
    "marks",
    "rows",
    "alloy_marks",
]);

function isSafeKey(key: string): boolean {
    if (BLOCKED_KEYS.has(key)) return false;
    if (
        key.endsWith("_ms") ||
        key.endsWith("_id") ||
        key.endsWith("_key") ||
        key.endsWith("_hit") ||
        key.endsWith("_warm") ||
        key.endsWith("_count") ||
        key.startsWith("drawer_open_") ||
        key.startsWith("since_")
    ) {
        return true;
    }
    return (
        key === "phase" ||
        key === "event" ||
        key === "entity_type" ||
        key === "entity_id" ||
        key === "record_id" ||
        key === "source" ||
        key === "status" ||
        key === "outcome" ||
        key === "layer" ||
        key === "surface" ||
        key === "route" ||
        key === "tab" ||
        key === "runtime" ||
        key === "path" ||
        key === "nav_source" ||
        key === "warm" ||
        key === "cold" ||
        key === "cache_hit" ||
        key === "applied" ||
        key === "skipped_reason" ||
        key === "bootstrap_owner" ||
        key === "overlay_shown" ||
        key === "prefetch_hit" ||
        key === "snapshot_warm" ||
        key === "detail" ||
        key === "reason" ||
        key === "error" ||
        key === "count" ||
        key === "rows_count" ||
        key === "seeded" ||
        key === "deferred" ||
        key === "buckets" ||
        key === "compose_ms" ||
        key === "fetch_ms" ||
        key === "diff_ms" ||
        key === "payload_kb" ||
        key === "payload_bytes" ||
        key === "client_cache_hit" ||
        key === "age_ms" ||
        key === "org_id" ||
        key === "department_id" ||
        key === "work_unit_id" ||
        key === "queue_key" ||
        key === "pill_key" ||
        key === "attention_bucket_key" ||
        key === "opportunity_id" ||
        key === "person_id" ||
        key === "child_id" ||
        key === "duration_ms" ||
        key === "total_ms" ||
        key === "since_gate_ms" ||
        key === "reveal_wait_ms" ||
        key === "request_id" ||
        key === "from_queue" ||
        key === "to_queue" ||
        key === "buffered_rows_used" ||
        key === "selected_queue_after" ||
        key === "api_path" ||
        key === "href" ||
        key === "ownershipKey" ||
        key === "url" ||
        key === "mark_count" ||
        key === "section_count" ||
        key === "section_id" ||
        key === "section_name" ||
        key === "blocking"
    );
}

function compact(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined || v === null || v === "") continue;
        if (Array.isArray(v) || (typeof v === "object" && v !== null)) continue;
        if (!isSafeKey(k)) continue;
        out[k] = v;
    }
    return out;
}

export function perfTag(namespace?: PerfNamespace | null): string {
    return namespace ? `[perf:${namespace}]` : "[perf]";
}

/** Primary emission — one structured warn line per boundary event. */
export function emitPerf(
    namespace: PerfNamespace | null | undefined,
    phase: string,
    payload: Record<string, unknown> = {}
): void {
    if (typeof console === "undefined" || typeof console.warn !== "function") return;
    console.warn(perfTag(namespace ?? undefined), compact({ phase, ...payload }));
}

export function perfDrawer(phase: string, payload: Record<string, unknown> = {}): void {
    emitPerf("drawer", phase, payload);
}

export function perfQueue(phase: string, payload: Record<string, unknown> = {}): void {
    emitPerf("queue", phase, payload);
}

export function perfWorkUnit(phase: string, payload: Record<string, unknown> = {}): void {
    emitPerf("work-unit", phase, payload);
}

export function perfCache(phase: string, payload: Record<string, unknown> = {}): void {
    emitPerf("cache", phase, payload);
}

export function perfPrefetch(phase: string, payload: Record<string, unknown> = {}): void {
    emitPerf("prefetch", phase, payload);
}

export function perfSave(phase: string, payload: Record<string, unknown> = {}): void {
    emitPerf("save", phase, payload);
}

export function perfSettings(phase: string, payload: Record<string, unknown> = {}): void {
    emitPerf("settings", phase, payload);
}

/**
 * Operator intent boundary (dev/staging): manual row click, selected-subject set, stale completion
 * ignored, default-resolver blocked by manual selection. One line per intent event — never in a loop.
 */
export function perfIntent(phase: string, payload: Record<string, unknown> = {}): void {
    if (!perfDevDetailEnabled()) return;
    emitPerf("intent", phase, payload);
}

export function perfRoot(phase: string, payload: Record<string, unknown> = {}): void {
    emitPerf(null, phase, payload);
}

export type AlloySectionStatus = "pending" | "ready" | "stale" | "refresh" | "error";

/**
 * Surface section load boundary (dev/staging only). One line per status transition for a
 * numbered section (see `alloySectionMap.ts`) — never in a render loop.
 *
 *   [perf:section] WU-02 { status: 'ready', source: 'bootstrap', blocking: false, since_nav_ms: 312 }
 */
export function perfSection(
    sectionId: string,
    status: AlloySectionStatus,
    payload: {
        source?: string;
        blocking?: boolean;
        since_nav_ms?: number;
    } & Record<string, unknown> = {}
): void {
    if (!perfDevDetailEnabled()) return;
    emitPerf("section", sectionId, { status, ...payload });
}

/** Shadow / cutover / DOM trace — opt-in only (`ADMIN_PERF_TRACE=1` or drawer runtime debug). */
export function perfDebugTraceEnabled(): boolean {
    return (
        process.env.ADMIN_PERF_TRACE === "1" ||
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_RUNTIME_DEBUG === "1" ||
        process.env.VITEST === "true"
    );
}

/** Dev/staging presentation gates, queue switch detail, etc. */
export function perfDevDetailEnabled(): boolean {
    return process.env.NODE_ENV !== "production" || process.env.VITEST === "true";
}

/** Map legacy dot-tag strings to colon namespaces for gradual migration. */
export function resolvePerfNamespaceFromTag(tag: string): PerfNamespace | null {
    const t = tag.toLowerCase();
    if (t.includes("save")) return "save";
    if (t.includes("prefetch") || t.includes("comms.prefetch")) return "prefetch";
    if (t.includes("cache") || t.includes("bootstrap-cache") || t.includes("context-cache")) return "cache";
    if (t.includes("queue")) return "queue";
    if (
        t.includes("drawer") ||
        t.includes("drawer-primary") ||
        t.includes("opportunity-api-visible") ||
        t.includes("presentation_gate") ||
        t.includes("layout_stability") ||
        t.includes("first_paint") ||
        t.includes("composed.breakdown")
    ) {
        return "drawer";
    }
    if (
        t.includes("work_unit") ||
        t.includes("wu.") ||
        t.includes("workspace") ||
        t.includes("dept") ||
        t.includes("route.shell") ||
        t.includes("reveal-gate") ||
        t.includes("bootstrap-perf") ||
        t.includes("wu-route")
    ) {
        return "work-unit";
    }
    return null;
}
