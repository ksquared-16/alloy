/** Structured timing for work-unit operational-bootstrap (server logs). */
export type WorkUnitBootstrapPerfPhases = {
    dept_fetch_ms?: number;
    work_unit_fetch_ms?: number;
    shared_bootstrap_ms?: number;
    queue_summaries_ms?: number;
    attention_ms?: number;
    attention_query_ms?: number;
    attention_resolver_ms?: number;
    attention_candidate_count?: number;
    attention_resolver_passes?: number;
    attention_rules_ms?: number;
    attention_bucket_merge_ms?: number;
    primary_lane_rows_ms?: number;
    pipeline_ms?: number;
    kpi_placements_ms?: number;
    kpi_placements_cache_hit?: boolean;
    right_rail_actions_ms?: number;
};

export function logWorkUnitOperationalBootstrapPerf(params: {
    workUnitId: string;
    departmentId: string;
    totalMs: number;
    routeGateMs?: number;
    prepMs?: number;
    loaderMs?: number;
    phases?: WorkUnitBootstrapPerfPhases;
}): void {
    if (params.totalMs < 250 && (params.loaderMs ?? params.totalMs) < 250) return;
    console.warn("[wu-bootstrap-perf]", {
        work_unit_id: params.workUnitId,
        department_id: params.departmentId,
        total_ms: params.totalMs,
        route_gate_ms: params.routeGateMs,
        route_prep_ms: params.prepMs,
        loader_ms: params.loaderMs,
        ...params.phases,
    });
}
