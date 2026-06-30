/**
 * Canonical Operational Projection — the single source of runtime work truth.
 *
 * Doctrine: every operational surface (workspace process card, Work View nav/sidebar count, Work View
 * header/pill count, Work Unit queue rows, Focus Panel membership) must agree because they all derive
 * from ONE projection: the work unit's **all-records base rows** filtered by each configured Work View's
 * **predicates (Work View Conditions V3)** through the **same evaluator** used for rows.
 *
 * Therefore, by construction:
 *  - `total` = base-row count (the process/work-unit scope).
 *  - each view's `count` === its `rows.length` (one evaluator, never a separate lane-summary count).
 *  - membership(record, view) uses the same predicate evaluator as the count/rows.
 *
 * Analytics metrics (e.g. "leads created in 30 days") are NOT this projection and must not masquerade
 * as operational queue truth.
 */

import {
    evaluateWorkViewFiltersForRow,
    filterQueueRowsByWorkViewFilters,
} from "@/lib/lifecycle/evaluateWorkViewFiltersV1";
import { resolveWorkViewMatchV1, type WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

export type OperationalProjectionRow = Record<string, unknown>;

export type OperationalProjectionView = {
    id: string;
    label: string;
    visibleInRuntime: boolean;
    /** Count === rows.length, always — derived from the same predicate filter. */
    count: number;
    /** Empty when the projection was computed count-only (`includeRows: false`). */
    rows: OperationalProjectionRow[];
};

export type OperationalProjection = {
    /** All-records base count for the process / work unit scope. */
    total: number;
    views: OperationalProjectionView[];
    byViewId: Record<string, OperationalProjectionView>;
};

/**
 * Compute the operational projection for a work unit: total + per-Work-View count (and optionally rows),
 * all from the all-records base rows + each view's V3 predicates via the shared evaluator.
 *
 * Pass `includeRows: false` for a cheap count-only projection (nav/card badges); the per-view `count` is
 * still the predicate-filtered count, NOT a lane summary.
 */
export function computeOperationalProjection(params: {
    baseRows: ReadonlyArray<OperationalProjectionRow>;
    workViews: ReadonlyArray<WorkViewConfigV1Stored>;
    includeRows?: boolean;
}): OperationalProjection {
    const baseRows = params.baseRows as OperationalProjectionRow[];
    const includeRows = params.includeRows !== false;
    const total = baseRows.length;

    const views: OperationalProjectionView[] = params.workViews.map((view) => {
        // Empty filters → include-all (All Leads semantics). Same evaluator as the queue rows.
        const filtered = filterQueueRowsByWorkViewFilters(
            baseRows,
            view.filters_v1,
            resolveWorkViewMatchV1(view.match),
        );
        return {
            id: view.id,
            label: view.label,
            visibleInRuntime: view.visible_in_runtime !== false,
            count: filtered.length,
            rows: includeRows ? filtered : [],
        };
    });

    const byViewId: Record<string, OperationalProjectionView> = {};
    for (const v of views) byViewId[v.id] = v;
    return { total, views, byViewId };
}

/**
 * Focus Panel membership: whether a single record belongs to a Work View's projection — evaluated with
 * the SAME predicate evaluator as the count/rows (not a lane lookup). The Focus Panel loads a record by
 * id (deep links, cross-scope), but the runtime can use this to decide whether the record is inside the
 * active view, and offer "open in All Leads" when it is outside.
 */
export function recordMatchesWorkView(
    record: OperationalProjectionRow,
    view: Pick<WorkViewConfigV1Stored, "filters_v1" | "match"> | null | undefined,
): boolean {
    if (!view) return true; // no active view constraint → not out-of-scope
    return evaluateWorkViewFiltersForRow(record, view.filters_v1, resolveWorkViewMatchV1(view.match)).pass;
}

export type FocusPanelScopeState =
    | { kind: "in_scope" }
    | { kind: "no_active_view" }
    | { kind: "out_of_scope"; activeViewId: string; activeViewLabel: string };

/**
 * Classify a deep-linked record against the active Work View so the UI can show an explicit
 * "record is outside this view" state (with an "open in All Leads" action) instead of silently
 * showing a record the active queue counts as 0.
 */
export function resolveFocusPanelScope(params: {
    record: OperationalProjectionRow | null | undefined;
    activeView: WorkViewConfigV1Stored | null | undefined;
}): FocusPanelScopeState {
    const { record, activeView } = params;
    if (!activeView) return { kind: "no_active_view" };
    if (!record) return { kind: "in_scope" }; // record not yet loaded — don't assert out-of-scope
    if (recordMatchesWorkView(record, activeView)) return { kind: "in_scope" };
    return { kind: "out_of_scope", activeViewId: activeView.id, activeViewLabel: activeView.label };
}
