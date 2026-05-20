/** Structured timing for dept operational-bootstrap (server logs). */
export type DeptBootstrapPerfPhases = {
    dept_fetch_ms?: number;
    work_units_fetch_ms?: number;
    shared_bootstrap_ms?: number;
    queue_summaries_ms?: number;
    attention_ms?: number;
    pipeline_ms?: number;
    serialize_ms?: number;
    summary_wu_count?: number;
    pipeline_wu_count?: number;
    skipped_summary_wu_ids?: number;
};

export function logDeptOperationalBootstrapPerf(params: {
    departmentId: string;
    totalMs: number;
    routeGateMs?: number;
    prepMs?: number;
    loaderMs?: number;
    phases?: DeptBootstrapPerfPhases;
}): void {
    if (params.totalMs < 400 && (params.loaderMs ?? params.totalMs) < 400) return;
    console.warn("[dept-bootstrap-perf]", {
        department_id: params.departmentId,
        total_ms: params.totalMs,
        route_gate_ms: params.routeGateMs,
        route_prep_ms: params.prepMs,
        loader_ms: params.loaderMs,
        ...params.phases,
    });
}
