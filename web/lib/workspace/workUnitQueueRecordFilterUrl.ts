import {
    EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER,
    type WorkUnitQueueRecordFilterState,
    type WorkUnitQueueRecordSortKey,
} from "@/lib/workspace/workUnitQueueRecordFilterTypes";

const SORT_KEYS = new Set<WorkUnitQueueRecordSortKey>([
    "newest",
    "oldest",
    "follow_up_due",
    "tour_date",
    "priority_order",
]);

function readTrim(sp: URLSearchParams, key: string): string {
    return (sp.get(key) ?? "").trim();
}

function parseSort(raw: string): WorkUnitQueueRecordSortKey {
    const s = raw.trim() as WorkUnitQueueRecordSortKey;
    return SORT_KEYS.has(s) ? s : "newest";
}

/** Read record filter state from URL search params (Card 14B). */
export function readWorkUnitQueueRecordFiltersFromSearchParams(
    sp: URLSearchParams
): WorkUnitQueueRecordFilterState {
    const attentionFromLegacy = readTrim(sp, "attention_reason_code");
    const attentionFromRf = readTrim(sp, "rf_attention");
    return {
        search: readTrim(sp, "q"),
        statusKey: readTrim(sp, "rf_status") || readTrim(sp, "status_keys"),
        dateFrom: readTrim(sp, "rf_from"),
        dateTo: readTrim(sp, "rf_to"),
        siteKey: readTrim(sp, "rf_site"),
        program: readTrim(sp, "rf_program"),
        ownerKey: readTrim(sp, "rf_owner"),
        attentionReasonCode: attentionFromRf || attentionFromLegacy,
        sort: parseSort(readTrim(sp, "rf_sort")),
    };
}

export function readWorkUnitQueueRecordFiltersFromLocation(): WorkUnitQueueRecordFilterState {
    if (typeof window === "undefined") return { ...EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER };
    try {
        return readWorkUnitQueueRecordFiltersFromSearchParams(new URLSearchParams(window.location.search));
    } catch {
        return { ...EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER };
    }
}

function setOrDelete(sp: URLSearchParams, key: string, value: string): void {
    const t = value.trim();
    if (t) sp.set(key, t);
    else sp.delete(key);
}

/** Serialize record filters to URL params (preserves unrelated query keys). */
export function writeWorkUnitQueueRecordFiltersToSearchParams(
    base: URLSearchParams,
    filters: WorkUnitQueueRecordFilterState
): URLSearchParams {
    const sp = new URLSearchParams(base.toString());
    setOrDelete(sp, "q", filters.search);
    setOrDelete(sp, "rf_status", filters.statusKey);
    setOrDelete(sp, "rf_from", filters.dateFrom);
    setOrDelete(sp, "rf_to", filters.dateTo);
    setOrDelete(sp, "rf_site", filters.siteKey);
    setOrDelete(sp, "rf_program", filters.program);
    setOrDelete(sp, "rf_owner", filters.ownerKey);
    setOrDelete(sp, "rf_attention", filters.attentionReasonCode);
    if (filters.sort !== "newest") setOrDelete(sp, "rf_sort", filters.sort);
    else sp.delete("rf_sort");
    // Legacy keys — clear when superseded by rf_* bar
    if (filters.statusKey) sp.delete("status_keys");
    if (filters.attentionReasonCode) {
        sp.delete("attention_reason");
        sp.delete("attention_reason_code");
    }
    return sp;
}

/** Update browser URL without navigation (work-unit local filter state). */
export function replaceWorkUnitQueueRecordFiltersInLocation(filters: WorkUnitQueueRecordFilterState): void {
    if (typeof window === "undefined") return;
    try {
        const url = new URL(window.location.href);
        const next = writeWorkUnitQueueRecordFiltersToSearchParams(url.searchParams, filters);
        const search = next.toString();
        const href = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
        window.history.replaceState(window.history.state, "", href);
    } catch {
        /* ignore */
    }
}
