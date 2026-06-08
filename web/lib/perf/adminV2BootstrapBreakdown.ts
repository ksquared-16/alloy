/**
 * Pass 3 load-time breakdown logs — dev/staging only; no production console noise.
 * Filter: `[perf.wu.bootstrap.breakdown]`, `[perf.dept.bootstrap.breakdown]`, `[perf.drawer.composed.breakdown]`
 */

import type { BootstrapServerPerfEnvelope } from "@/lib/workspace/bootstrapServerPerfEnvelope";
import { emitAdminV2Perf } from "@/lib/perf/adminV2PerfLog";

export function adminV2BootstrapBreakdownEnabled(): boolean {
    return process.env.NODE_ENV !== "production";
}

function roundMs(n: number | null | undefined): number | undefined {
    if (n == null || !Number.isFinite(n)) return undefined;
    return Math.round(n);
}

function payloadKb(bytes: number | null | undefined): number | undefined {
    if (bytes == null || bytes <= 0) return undefined;
    return Math.round((bytes / 1024) * 10) / 10;
}

function rankBottleneck(steps: Record<string, number | undefined>): string {
    const ranked = Object.entries(steps)
        .filter(([, v]) => typeof v === "number" && v > 0)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    return ranked[0]?.[0] ?? "unknown";
}

export type WorkUnitBootstrapClientTimings = {
    route_mount_to_fetch_start_ms?: number;
    client_fetch_ttfb_ms?: number;
    client_json_parse_ms?: number;
    client_state_apply_ms?: number;
    client_total_ms?: number;
    bootstrap_owner?: string;
    payload_bytes?: number;
};

export function logWorkUnitBootstrapBreakdown(args: {
    departmentId: string;
    workUnitId: string;
    serverPerf?: BootstrapServerPerfEnvelope | null;
    client?: WorkUnitBootstrapClientTimings;
    duplicate_fetch_guard?: string | null;
}): void {
    if (!adminV2BootstrapBreakdownEnabled()) return;

    const phases = (args.serverPerf?.phases ?? {}) as Record<string, number | undefined>;
    const server = args.serverPerf ?? {};

    const steps: Record<string, number | undefined> = {
        route_gate_auth_context: server.route_gate_ms,
        route_prep_scope: server.route_prep_ms,
        work_unit_lookup: phases.work_unit_fetch_ms,
        department_lookup: phases.dept_fetch_ms,
        queue_summaries: phases.queue_summaries_ms,
        attention_work: phases.attention_ms,
        attention_query: phases.attention_query_ms,
        attention_resolver: phases.attention_resolver_ms,
        primary_lane_rows: phases.primary_lane_rows_ms,
        right_rail_actions: phases.right_rail_actions_ms,
        kpi_placements: phases.kpi_placements_ms,
        loader_wall: server.loader_ms,
        client_fetch_ttfb: args.client?.client_fetch_ttfb_ms,
        client_json_parse: args.client?.client_json_parse_ms,
        client_state_apply: args.client?.client_state_apply_ms,
    };

    emitAdminV2Perf("[perf.wu.bootstrap.breakdown]", {
        surface: "work_unit",
        department_id: args.departmentId,
        work_unit_id: args.workUnitId,
        route_gate_auth_context_ms: roundMs(server.route_gate_ms),
        route_prep_scope_ms: roundMs(server.route_prep_ms),
        work_unit_lookup_ms: roundMs(phases.work_unit_fetch_ms),
        department_lookup_ms: roundMs(phases.dept_fetch_ms),
        queue_summaries_ms: roundMs(phases.queue_summaries_ms),
        primary_lane_rows_ms: roundMs(phases.primary_lane_rows_ms),
        primary_lane_rows_deferred: phases.primary_lane_rows_deferred,
        right_rail_actions_ms: roundMs(phases.right_rail_actions_ms),
        right_rail_actions_deferred: phases.right_rail_actions_deferred,
        kpi_placements_ms: roundMs(phases.kpi_placements_ms),
        kpi_placements_deferred: phases.kpi_placements_deferred ?? phases.kpi_placements_deferred_on_route,
        attention_ms: roundMs(phases.attention_ms),
        attention_query_ms: roundMs(phases.attention_query_ms),
        attention_resolver_ms: roundMs(phases.attention_resolver_ms),
        attention_deferred: phases.attention_deferred,
        loader_ms: roundMs(server.loader_ms),
        client_fetch_ttfb_ms: roundMs(args.client?.client_fetch_ttfb_ms),
        client_json_parse_ms: roundMs(args.client?.client_json_parse_ms),
        client_state_apply_ms: roundMs(args.client?.client_state_apply_ms),
        client_total_ms: roundMs(args.client?.client_total_ms),
        bootstrap_owner: args.client?.bootstrap_owner,
        payload_kb: payloadKb(args.client?.payload_bytes ?? server.payload_bytes),
        slowest_step: rankBottleneck(steps),
        duplicate_fetch_guard: args.duplicate_fetch_guard ?? undefined,
        source: "network",
    });
}

export type DeptBootstrapClientTimings = {
    client_fetch_ttfb_ms?: number;
    client_json_parse_ms?: number;
    client_state_apply_ms?: number;
    client_total_ms?: number;
    cache_hit?: boolean;
    inflight_join?: boolean;
    payload_bytes?: number;
};

export function logDeptBootstrapBreakdown(args: {
    departmentId: string;
    serverPerf?: BootstrapServerPerfEnvelope | null;
    client?: DeptBootstrapClientTimings;
    duplicate_fetch_guard?: string | null;
}): void {
    if (!adminV2BootstrapBreakdownEnabled()) return;

    const phases = (args.serverPerf?.phases ?? {}) as Record<string, number | undefined>;
    const server = args.serverPerf ?? {};

    const steps: Record<string, number | undefined> = {
        route_gate_auth_context: server.route_gate_ms,
        route_prep_scope: server.route_prep_ms,
        department_lookup: phases.dept_fetch_ms,
        work_units: phases.work_units_fetch_ms,
        queue_summaries: phases.queue_summaries_ms,
        attention_query: phases.attention_query_ms ?? phases.attention_candidate_fetch_ms,
        attention_resolver: phases.attention_resolver_ms,
        attention_work: phases.attention_ms,
        kpi_placements: phases.kpi_placements_ms,
        right_rail_actions: phases.right_rail_actions_ms,
        pipeline: phases.pipeline_ms,
        serialize: phases.serialize_ms,
        loader_wall: server.loader_ms,
        client_fetch_ttfb: args.client?.client_fetch_ttfb_ms,
        client_json_parse: args.client?.client_json_parse_ms,
        client_state_apply: args.client?.client_state_apply_ms,
    };

    emitAdminV2Perf("[perf.dept.bootstrap.breakdown]", {
        surface: "department",
        department_id: args.departmentId,
        route_gate_auth_context_ms: roundMs(server.route_gate_ms),
        route_prep_scope_ms: roundMs(server.route_prep_ms),
        department_lookup_ms: roundMs(phases.dept_fetch_ms),
        work_units_ms: roundMs(phases.work_units_fetch_ms),
        queue_summaries_ms: roundMs(phases.queue_summaries_ms),
        attention_ms: roundMs(phases.attention_ms),
        attention_query_ms: roundMs(phases.attention_query_ms ?? phases.attention_candidate_fetch_ms),
        attention_resolver_ms: roundMs(phases.attention_resolver_ms),
        attention_source: phases.attention_source,
        kpi_placements_ms: roundMs(phases.kpi_placements_ms),
        right_rail_actions_ms: roundMs(phases.right_rail_actions_ms),
        pipeline_ms: roundMs(phases.pipeline_ms),
        serialize_ms: roundMs(phases.serialize_ms),
        loader_ms: roundMs(server.loader_ms),
        client_fetch_ttfb_ms: roundMs(args.client?.client_fetch_ttfb_ms),
        client_json_parse_ms: roundMs(args.client?.client_json_parse_ms),
        client_state_apply_ms: roundMs(args.client?.client_state_apply_ms),
        client_total_ms: roundMs(args.client?.client_total_ms),
        prefetch_cache_hit: args.client?.cache_hit,
        prefetch_inflight_join: args.client?.inflight_join,
        payload_kb: payloadKb(args.client?.payload_bytes ?? server.payload_bytes),
        slowest_step: rankBottleneck(steps),
        duplicate_fetch_guard: args.duplicate_fetch_guard ?? undefined,
        source: args.client?.cache_hit ? "cache" : "network",
    });
}

export type DrawerComposedBreakdown = {
    opportunityId: string;
    bootstrap_ms: number;
    drawer_primary_ms: number;
    header_actions_ms: number;
    anti_flicker_ms: number;
    wait_for_composed_ms: number;
    full_hydrate_ms?: number | null;
    full_hydrate_pending?: boolean;
    react_commit_ms?: number | null;
    prefetch_hit: boolean;
    bootstrap_warm: boolean;
    primary_warm: boolean;
    full_warm?: boolean;
    enrichment_held?: boolean;
    full_attached_at_open?: boolean;
};

export function logDrawerComposedBreakdown(metrics: DrawerComposedBreakdown): void {
    if (!adminV2BootstrapBreakdownEnabled()) return;

    const steps: Record<string, number | undefined> = {
        drawer_operational_bootstrap: metrics.bootstrap_ms,
        drawer_primary: metrics.drawer_primary_ms,
        record_header_actions: metrics.header_actions_ms,
        anti_flicker_wait: metrics.anti_flicker_ms,
        wait_for_composed: metrics.wait_for_composed_ms,
        full_hydrate: metrics.full_hydrate_ms ?? undefined,
        react_commit: metrics.react_commit_ms ?? undefined,
    };

    emitAdminV2Perf("[perf.drawer.composed.breakdown]", {
        surface: "drawer_opportunity",
        opportunity_id: metrics.opportunityId,
        entity_id: metrics.opportunityId,
        drawer_operational_bootstrap_ms: roundMs(metrics.bootstrap_ms),
        drawer_primary_ms: roundMs(metrics.drawer_primary_ms),
        record_header_actions_ms: roundMs(metrics.header_actions_ms),
        anti_flicker_wait_ms: roundMs(metrics.anti_flicker_ms),
        wait_for_composed_ms: roundMs(metrics.wait_for_composed_ms),
        full_hydrate_ms: roundMs(metrics.full_hydrate_ms ?? undefined),
        full_hydrate_pending: metrics.full_hydrate_pending,
        react_commit_ms: roundMs(metrics.react_commit_ms ?? undefined),
        prefetch_hit: metrics.prefetch_hit,
        bootstrap_warm: metrics.bootstrap_warm,
        primary_warm: metrics.primary_warm,
        full_warm: metrics.full_warm,
        enrichment_held: metrics.enrichment_held,
        full_attached_at_open: metrics.full_attached_at_open,
        slowest_step: rankBottleneck(steps),
        source: metrics.prefetch_hit ? "cache" : "network",
    });
}

/** Dev guard when a happy-path fetch is suppressed because bootstrap already hydrated data. */
export function logAdminV2DuplicateFetchSuppressed(args: {
    surface: "work_unit" | "department";
    fetch: string;
    reason: string;
    departmentId?: string;
    workUnitId?: string;
}): void {
    if (!adminV2BootstrapBreakdownEnabled()) return;
    emitAdminV2Perf("[perf.bootstrap.duplicate_fetch_suppressed]", {
        surface: args.surface,
        phase: args.fetch,
        department_id: args.departmentId,
        work_unit_id: args.workUnitId,
        reason: args.reason,
        source: "cache",
    });
}
