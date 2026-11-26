/**
 * Grouped Work View totals (Trust Closure — canonical-total batching, §8 real batching).
 *
 * The per-view count fan-out issued N HTTP requests, each re-fetching the base lane and filtering it
 * for ONE view. This computes EVERY requested view's count from ONE base-lane fetch, in memory, via
 * the canonical `computeOperationalProjection` — the SAME predicate evaluator the single queue route
 * uses (`filterQueueRowsForWorkView`). Parity is therefore by construction: same base rows + same
 * evaluator ⇒ identical counts. This function is PURE and issues zero queries — the caller performs
 * exactly one base-lane fetch per distinct (workUnitId, queueKey), never one per view.
 */

import {
    computeOperationalProjection,
    type OperationalProjectionRow,
} from "@/lib/lifecycle/operationalProjection";
import { isWorkViewCatchAll, type WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

export type WorkViewTotal = {
    /** Predicate-filtered count for the view (or the exact lane total for an include-all view). */
    count: number;
    /**
     * The count is exact. False when the base lane was truncated at the fetch cap, so a filtered
     * count could undercount — the caller surfaces `known:false` as "unknown", not a wrong number.
     */
    known: boolean;
};

/**
 * Compute totals for the given views from ONE base-lane page.
 *
 * @param exactLaneTotal the lane's exact all-records count (from a `count_mode=exact` read); used for
 *   include-all views so their count is exact even when the base page is capped. `null` when unknown.
 * @param baseTruncated  the base page hit the fetch cap (filtered counts may undercount).
 */
export function aggregateWorkViewTotals(args: {
    baseRows: ReadonlyArray<OperationalProjectionRow>;
    workViews: ReadonlyArray<WorkViewConfigV1Stored>;
    exactLaneTotal: number | null;
    baseTruncated: boolean;
}): Record<string, WorkViewTotal> {
    const projection = computeOperationalProjection({
        baseRows: args.baseRows,
        workViews: args.workViews,
        includeRows: false,
    });

    const out: Record<string, WorkViewTotal> = {};
    for (const view of args.workViews) {
        if (isWorkViewCatchAll(view)) {
            // Include-all (empty predicates) === the lane's all-records total. Prefer the exact count
            // so it is right even when the base page is capped.
            out[view.id] =
                args.exactLaneTotal != null
                    ? { count: args.exactLaneTotal, known: true }
                    : { count: projection.byViewId[view.id]?.count ?? 0, known: !args.baseTruncated };
        } else {
            out[view.id] = {
                count: projection.byViewId[view.id]?.count ?? 0,
                known: !args.baseTruncated,
            };
        }
    }
    return out;
}
