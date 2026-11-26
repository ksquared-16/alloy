/**
 * Queue row hold — pure helpers for Step D queue continuity.
 * Data retention lives in `useWorkUnitSurfaceRuntime` (implicit `queueResult` hold);
 * these helpers document and test the display contract.
 */

/** Canonical queue population identity for same-host Work View switches. */
export function queuePopulationIdentityKey(args: {
    selectedSiteId: string | null;
    workUnitId: string;
    workViewId: string | null;
    baseQueueKey: string;
}): string {
    return `${args.selectedSiteId ?? ""}|${args.workUnitId}|${args.workViewId ?? ""}|${args.baseQueueKey}`;
}

/**
 * During an in-flight fetch with prior rows held, client filters must not hide all rows
 * (false empty). Fall back to unfiltered held rows until destination settles.
 */
export function queueRowsForListDuringHold<T>(args: {
    queueRows: readonly T[];
    visibleRows: readonly T[];
    loading: boolean;
    filterActive: boolean;
}): readonly T[] {
    const holdActive = args.loading && args.queueRows.length > 0;
    if (holdActive && args.filterActive && args.visibleRows.length === 0) {
        return args.queueRows;
    }
    return args.visibleRows;
}

/** Fetch failures retain prior rows when the runtime already has a settled population. */
export function shouldClearQueueResultOnFetchError(hasPriorRows: boolean): boolean {
    return !hasPriorRows;
}
