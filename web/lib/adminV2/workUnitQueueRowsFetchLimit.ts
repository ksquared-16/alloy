/** Work-unit lane row fetch — align loaded page with pill count (cap 100, API max). */
export const WORK_UNIT_QUEUE_ROWS_FETCH_MIN = 20;
export const WORK_UNIT_QUEUE_ROWS_FETCH_MAX = 100;
/** Reveal/prefetch first viewport — slim KPI pill warm path. */
export const WORK_UNIT_QUEUE_REVEAL_FETCH_ROWS = 10;

export function resolveWorkUnitQueueRowsFetchLimit(
    summaryCount?: number | null,
    opts?: { searchActive?: boolean }
): number {
    if (opts?.searchActive) return WORK_UNIT_QUEUE_ROWS_FETCH_MAX;
    const n =
        typeof summaryCount === "number" && Number.isFinite(summaryCount) && summaryCount > 0
            ? Math.floor(summaryCount)
            : WORK_UNIT_QUEUE_ROWS_FETCH_MIN;
    return Math.min(Math.max(n, WORK_UNIT_QUEUE_ROWS_FETCH_MIN), WORK_UNIT_QUEUE_ROWS_FETCH_MAX);
}
