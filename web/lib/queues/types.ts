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
};

