import type { QueueGrain } from "@/lib/config/queueDefinitionV2Runtime";

/** Client-side record filter/sort for work-unit queue rows (Card 14B). Does not change queue membership. */
export type WorkUnitQueueRecordSortKey =
    | "newest"
    | "oldest"
    | "follow_up_due"
    | "tour_date"
    | "priority_order";

export type WorkUnitQueueRecordFilterState = {
    search: string;
    statusKey: string;
    dateFrom: string;
    dateTo: string;
    siteKey: string;
    program: string;
    ownerKey: string;
    attentionReasonCode: string;
    sort: WorkUnitQueueRecordSortKey;
};

export const EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER: WorkUnitQueueRecordFilterState = {
    search: "",
    statusKey: "",
    dateFrom: "",
    dateTo: "",
    siteKey: "",
    program: "",
    ownerKey: "",
    attentionReasonCode: "",
    sort: "newest",
};

export type WorkUnitQueueRecordFilterKind =
    | "search"
    | "status"
    | "date_range"
    | "site"
    | "program"
    | "owner"
    | "attention_reason"
    | "sort";

export type WorkUnitQueueRecordFilterFieldSpec = {
    kind: WorkUnitQueueRecordFilterKind;
    label: string;
};

export type WorkUnitQueueRecordFilterContext = {
    entityType: "job" | "schedule" | "opportunity";
    queueKey: string;
    grain?: QueueGrain;
    domain?: string;
    isNeedsAttention: boolean;
};

export type WorkUnitQueueRecordFilterFacets = {
    statusOptions: Array<{ value: string; label: string }>;
    siteOptions: Array<{ value: string; label: string }>;
    programOptions: Array<{ value: string; label: string }>;
    ownerOptions: Array<{ value: string; label: string }>;
    attentionReasonOptions: Array<{ value: string; label: string }>;
    sortOptions: Array<{ value: WorkUnitQueueRecordSortKey; label: string }>;
};

export type WorkUnitQueueRecordFilterApplyResult = {
    items: Record<string, unknown>[];
    filteredCount: number;
    totalLoaded: number;
};
