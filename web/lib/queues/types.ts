import type { OperationalTimezoneSource, UserDisplayTimezoneSource } from "@/lib/admin/timezoneContract";
import type { WorkUnitPlacementQueueDiagnostics } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import type { QueueServiceOpportunityNeedsAttentionSemantics } from "@/lib/workspace/opportunityAttentionCountSemantics";

/** Resolved viewer wall clock for queue preview strings (user → org → UTC). */
export type QueueViewerTimezoneMeta = { iana: string; source: UserDisplayTimezoneSource };

/** Present when a queue uses org operational calendar day filters (`today` / `past_due`). */
export type QueueOperationalCalendarMeta = {
    calendar_type: "operational_day";
    timezone_effective: string;
    timezone_source: OperationalTimezoneSource;
    day_start_utc: string;
    day_end_exclusive_utc: string;
};

export type QueueSummary = {
    key: string;
    label: string;
    description?: string;
    entity_type: "job" | "schedule" | "opportunity";
    priority: "standard" | "attention" | "critical";
    display: "list" | "cards";
    count: number;
    preview: unknown[];
    /** True when count is a placeholder (0) and a follow-up `queue_summary_mode=partial` fetch should replace it. */
    counts_deferred?: boolean;
    /** Org operational day bounds used by this queue's calendar date filters (if any). */
    calendar_meta?: QueueOperationalCalendarMeta;
    /**
     * Present when `entity_type==="opportunity"` and `key==="needs_attention"`.
     * Explains bounded candidate fetch vs exhaustive org totals (`docs/execution/crm-opportunity-needs-attention-count-semantics.md`).
     */
    opportunity_needs_attention_semantics?: QueueServiceOpportunityNeedsAttentionSemantics;
};

export type QueueItemsResult = {
    queue: {
        key: string;
        label: string;
        description?: string;
        entity_type: "job" | "schedule" | "opportunity";
        priority: "standard" | "attention" | "critical";
        display: "list" | "cards";
    };
    /** Preview projections for lane rendering — not authoritative records (see workspace / record system docs). */
    items: unknown[];
    total: number;
    limit: number;
    offset: number;
    /** Same shape as {@link QueueSummary.opportunity_needs_attention_semantics} for list routes. */
    opportunity_needs_attention_semantics?: QueueServiceOpportunityNeedsAttentionSemantics;
    /** When `count_mode=omit`, total was not queried; UI may fall back to tab/summary counts. */
    total_omitted?: boolean;
    /** Org operational day bounds when this queue uses calendar date filters. */
    calendar_meta?: QueueOperationalCalendarMeta;
    /** Echo of the IANA zone used for note/tour preview strings on `items` (devtools / QA). */
    viewer_timezone?: QueueViewerTimezoneMeta;
    /**
     * Present when `metadata.placement_priority_v1` resolved **enabled** for this lane (`QueueService` Card 6).
     * Non-authoritative projection diagnostics — not a persisted snapshot.
     */
    placement_projection_diagnostics?: WorkUnitPlacementQueueDiagnostics;
};

