/** Server queue summary timing — logs only when total path exceeds threshold. */
export function logQueueSummaryPerf(params: {
    tag: string;
    totalMs: number;
    orgId: string;
    workUnitId?: string;
    departmentId?: string;
    summaryCount?: number;
    includePreviews?: boolean;
    sharedBootstrapCacheHit?: boolean;
    phases?: Record<string, number | boolean | string | null | undefined>;
}): void {
    if (params.totalMs < 100) return;
    console.warn("[queue-summary-perf]", {
        tag: params.tag,
        total_ms: params.totalMs,
        org_id: params.orgId,
        work_unit_id: params.workUnitId,
        department_id: params.departmentId,
        summary_count: params.summaryCount,
        include_previews: params.includePreviews,
        shared_bootstrap_cache_hit: params.sharedBootstrapCacheHit,
        ...params.phases,
    });
}
