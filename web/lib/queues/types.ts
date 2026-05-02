import type { OperationalTimezoneSource } from "@/lib/admin/timezoneContract";

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
    items: unknown[];
    total: number;
    limit: number;
    offset: number;
    /** When `count_mode=omit`, total was not queried; UI may fall back to tab/summary counts. */
    total_omitted?: boolean;
    /** Org operational day bounds when this queue uses calendar date filters. */
    calendar_meta?: QueueOperationalCalendarMeta;
};

