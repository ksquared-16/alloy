/**
 * Standardized perf / timing console payloads for Admin V2 staging & production troubleshooting.
 * — One line per emission; avoids render-loop noise by design (call only at phase boundaries).
 * — Prefer `surface` + `route` so logs filter cleanly in GCP/staging consoles.
 */

export type AdminV2PerfSource = "cache" | "network" | "background";

/** Common fields appended across `[perf.workspace.load]`, `[perf.dept.load]`, queue, drawer, etc. */
export type AdminV2PerfCommon = {
    surface?: string;
    /** HTTP path template or pathname, e.g. `/adminV2/workspace` */
    route?: string;
    total_ms?: number;
    org_id?: string | null;
    department_id?: string | null;
    work_unit_id?: string | null;
    entity_id?: string | null;
    opportunity_id?: string | null;
    queue_key?: string | null;
    phase?: string;
    source?: AdminV2PerfSource;
    /** Client session / in-memory caches (workspace shell, queue row LRU, …) */
    client_cache_hit?: boolean;
    /** Server-side memoized reads (queue definition row, status defs packs, …) */
    queue_def_cache_hit?: boolean | null;
    operational_day_cache_hit?: boolean | null;
    status_defs_cache_hit?: boolean | null;
};

function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined && v !== null && v !== "") out[k] = v;
    }
    return out;
}

/** Merge standard envelope fields with event-specific payloads; emits a single structured line. */
export function emitAdminV2Perf(tag: string, payload: AdminV2PerfCommon & Record<string, unknown>): void {
    console.warn(tag, compact(payload as Record<string, unknown>));
}

export function perfWorkspaceLoad(args: {
    phase: string;
    ms: number;
    source: AdminV2PerfSource;
    org_id?: string | null;
    /** True when hydrated from session snapshot before network completed */
    client_cache_hit?: boolean;
}): void {
    emitAdminV2Perf("[perf.workspace.load]", {
        surface: "workspace_root",
        route: "/adminV2/workspace",
        phase: args.phase,
        total_ms: args.ms,
        source: args.source,
        org_id: args.org_id ?? undefined,
        client_cache_hit: args.client_cache_hit,
    });
}

export function perfDeptLoad(args: {
    phase: string;
    ms: number;
    source: AdminV2PerfSource;
    org_id?: string | null;
    department_id?: string | null;
    client_cache_hit?: boolean;
}): void {
    emitAdminV2Perf("[perf.dept.load]", {
        surface: "workspace_department",
        route: args.department_id ? `/adminV2/workspace/dept/${args.department_id}` : "/adminV2/workspace/dept/[departmentId]",
        phase: args.phase,
        total_ms: args.ms,
        source: args.source,
        org_id: args.org_id ?? undefined,
        department_id: args.department_id ?? undefined,
        client_cache_hit: args.client_cache_hit,
    });
}

export function perfQueueRowsServer(args: AdminV2PerfCommon & Record<string, unknown>): void {
    emitAdminV2Perf("[perf.queue.rows]", {
        route: `/api/admin/queues/[workUnitId]/[queueKey]`,
        surface: "work_unit_queue_rows",
        phase: "server_request",
        source: "network",
        ...args,
    });
}

export function perfQueueRowsClientSide(args: {
    event: string;
    work_unit_id?: string;
    queue_key?: string;
    age_ms?: number | null;
    client_cache_hit?: boolean;
    org_id?: string | null;
}): void {
    emitAdminV2Perf("[perf.queue.rows]", {
        phase: args.event,
        surface: "work_unit_queue_rows",
        route: "/api/admin/queues/[workUnitId]/[queueKey]",
        source: args.client_cache_hit ? "cache" : "network",
        work_unit_id: args.work_unit_id,
        queue_key: args.queue_key,
        client_cache_hit: args.client_cache_hit,
        age_ms: args.age_ms ?? undefined,
        org_id: args.org_id ?? undefined,
    });
}

/** Drawer full hydrate completion (GET entity opportunities surface=full) */
export function perfDrawerFullHydrate(args: AdminV2PerfCommon & Record<string, unknown>): void {
    emitAdminV2Perf("[perf.drawer.full_hydrate]", {
        route: `/api/admin/entity/opportunities/[id]`,
        surface: "drawer_full_hydrate",
        source: "network",
        ...args,
    });
}

/** Drawer visible shell timing (aligned tag kept for dashboards that grep `opportunity-api-visible`) */
export function timingOpportunityApiVisible(args: {
    opportunity_id: string;
    org_id: string;
    work_unit_id?: string | null;
    department_id?: string | null;
    total_ms: number;
    enrich_phases_ms?: Record<string, number>;
    server_route_ms?: number;
    surface?: string;
    source?: AdminV2PerfSource;
    status_defs_cache_hit?: boolean;
}): void {
    emitAdminV2Perf("[timing][opportunity-api-visible]", {
        surface: "drawer_visible",
        route: `/api/admin/entity/opportunities/[id]?surface=drawer_visible`,
        entity_id: args.opportunity_id,
        opportunity_id: args.opportunity_id,
        org_id: args.org_id,
        work_unit_id: args.work_unit_id ?? undefined,
        department_id: args.department_id ?? undefined,
        total_ms: args.total_ms,
        enrich_ms: args.total_ms,
        enrich_phases_ms: args.enrich_phases_ms,
        server_route_ms: args.server_route_ms,
        source: args.source ?? "network",
        status_defs_cache_hit: args.status_defs_cache_hit,
    });
}
