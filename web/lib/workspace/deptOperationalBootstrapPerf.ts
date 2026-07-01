/** Structured timing for dept operational-bootstrap (server logs). */
import { perfWorkUnit } from "@/lib/perf/perfNamespaceLog";

export type DeptBootstrapPerfPhases = {
    dept_fetch_ms?: number;
    work_units_fetch_ms?: number;
    shared_bootstrap_ms?: number;
    shared_bootstrap_reused?: boolean;
    queue_summaries_ms?: number;
    attention_ms?: number;
    /** `work_unit_needs_attention_lane` vs `department_attention_preview` — explains missing subtimings. */
    attention_source?: string;
    attention_detail_mode?: string;
    bundle_mode?: string;
    /** @deprecated Use attention_query_ms — kept for log continuity. */
    attention_candidate_fetch_ms?: number;
    attention_query_ms?: number;
    attention_candidate_count?: number;
    attention_membership_filter_ms?: number;
    attention_resolver_ms?: number;
    attention_rules_ms?: number;
    attention_bucket_merge_ms?: number;
    pipeline_ms?: number;
    pipeline_lane_queues_ms?: number;
    parallel_oper_ms?: number;
    kpi_placements_ms?: number;
    kpi_placements_cache_hit?: boolean;
    right_rail_actions_ms?: number;
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
    payloadBytes?: number;
    phases?: DeptBootstrapPerfPhases;
}): void {
    if (params.totalMs < 250 && (params.loaderMs ?? params.totalMs) < 250) return;
    const payloadKb =
        typeof params.payloadBytes === "number"
            ? Math.round((params.payloadBytes / 1024) * 10) / 10
            : undefined;
    perfWorkUnit("dept_bootstrap_server", {
        department_id: params.departmentId,
        total_ms: params.totalMs,
        duration_ms: params.totalMs,
        payload_kb: payloadKb,
        source: "network",
    });
}
