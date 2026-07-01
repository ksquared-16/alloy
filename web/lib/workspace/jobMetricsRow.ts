/**
 * Enriched job row shape from GET /api/admin/jobs — shared by workspace metrics, exception predicates, and queues.
 */
export type JobRowForWorkspaceMetrics = {
    id: string;
    work_unit_id?: string | null;
    gross_price_cents?: number | null;
    /** Next future schedule start from jobs list enrichment. */
    _next_schedule?: string | null;
    receivable_outstanding_cents?: number | null;
    status_key?: string | null;
    title?: string | null;
    _job_label?: string | null;
    _location_label?: string | null;
    _vendor_name?: string | null;
    _assigned_vendor_name?: string | null;
};
