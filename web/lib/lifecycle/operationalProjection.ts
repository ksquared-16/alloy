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
import {
    resolveWorkViewMatchV1,
    type WorkViewConfigV1Stored,
    type WorkViewFilterMatchV1,
} from "@/lib/lifecycle/workViewsConfigV1";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

export type OperationalProjectionRow = Record<string, unknown>;

/** `status_key` → process stage key (from `status_definitions.metadata.process_stage_key`). */
export type StatusStageMap = Record<string, string>;

/**
 * Materialize the process **stage** onto rows that carry only a **status**. Stage is a roll-up over
 * statuses: a record's stage = the stage its `status_key` belongs to. Opportunities do not store
 * `lifecycle_stage_key` (it is null in practice), so a Work View's Stage predicate (e.g. New Leads =
 * `opportunity_stage equals "lead"`) cannot evaluate until the stage is derived from the status. This
 * sets `lifecycle_stage_key` (the field the evaluator reads) from `statusStageMap[status_key]` when the
 * row lacks one — leaving any explicit stage untouched.
 */
export function enrichRowsWithDerivedStage<T extends OperationalProjectionRow>(
    rows: readonly T[],
    statusStageMap: StatusStageMap | null | undefined,
): T[] {
    if (!statusStageMap) return [...rows];
    return rows.map((row) => {
        const existing =
            typeof row.lifecycle_stage_key === "string" && row.lifecycle_stage_key.trim()
                ? row.lifecycle_stage_key
                : null;
        if (existing) return row;
        const status = typeof row.status_key === "string" ? row.status_key.trim() : "";
        const stage = status ? statusStageMap[status] : undefined;
        return stage ? ({ ...row, lifecycle_stage_key: stage } as T) : row;
    });
}

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
    /** Derive `opportunity_stage` from `status_key` so Stage predicates evaluate (see enrichRowsWithDerivedStage). */
    statusStageMap?: StatusStageMap | null;
}): OperationalProjection {
    const baseRows = enrichRowsWithDerivedStage(
        params.baseRows as OperationalProjectionRow[],
        params.statusStageMap,
    );
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
 * Per-Work-View operational signals — attention/overdue records inside each view. Secondary,
 * decision-supporting context for the process tile ("where should I work?"), NOT the count.
 *
 * Derived from the SAME base rows + view predicates as the projection counts, reading only the
 * GENERIC `_queue_row_context` operational fields (`attention_summary.needs_attention`,
 * `current_work_summary.due_label === "Overdue"`) that the queue attaches to every opportunity
 * row — no process-specific logic, no extra fetch. Rows without a context contribute nothing,
 * so a view yields zero signals rather than a fabricated one.
 */
export type WorkViewOperationalSignals = {
    attentionCount: number;
    overdueCount: number;
};

const OVERDUE_DUE_LABEL = "Overdue";

export function computeWorkViewOperationalSignals(params: {
    baseRows: ReadonlyArray<OperationalProjectionRow>;
    workViews: ReadonlyArray<WorkViewConfigV1Stored>;
    statusStageMap?: StatusStageMap | null;
}): Record<string, WorkViewOperationalSignals> {
    const projection = computeOperationalProjection({
        baseRows: params.baseRows,
        workViews: params.workViews,
        includeRows: true,
        statusStageMap: params.statusStageMap,
    });
    const out: Record<string, WorkViewOperationalSignals> = {};
    for (const view of projection.views) {
        let attentionCount = 0;
        let overdueCount = 0;
        for (const row of view.rows) {
            const ctx = (row as { _queue_row_context?: QueueRowContext })._queue_row_context;
            if (!ctx) continue;
            if (ctx.attention_summary?.needs_attention === true) attentionCount += 1;
            if (ctx.current_work_summary?.due_label === OVERDUE_DUE_LABEL) overdueCount += 1;
        }
        out[view.id] = { attentionCount, overdueCount };
    }
    return out;
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

export type WorkViewPlacementResult = {
    id: string;
    label: string;
    match: WorkViewFilterMatchV1;
    pass: boolean;
    filters: unknown;
};

export type RecordWorkViewPlacementDiagnostic = {
    recordId: string;
    status_key: string | null;
    stage_key: string | null;
    work_unit_id: string | null;
    views: WorkViewPlacementResult[];
};

/**
 * Diagnose why a record lands (or doesn't) in each Work View — evaluated with the SAME predicate
 * evaluator as the counts/rows, after deriving the stage from status. Dev/test diagnostic to explain
 * placement (e.g. why a New Lead shows under Registration, not New Leads).
 */
export function diagnoseRecordWorkViewPlacement(params: {
    record: OperationalProjectionRow;
    workViews: ReadonlyArray<WorkViewConfigV1Stored>;
    statusStageMap?: StatusStageMap | null;
}): RecordWorkViewPlacementDiagnostic {
    const [record] = enrichRowsWithDerivedStage([params.record], params.statusStageMap);
    const str = (k: string): string | null => {
        const v = record?.[k];
        return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    return {
        recordId: str("id") ?? "",
        status_key: str("status_key"),
        stage_key: str("lifecycle_stage_key"),
        work_unit_id: str("work_unit_id"),
        views: params.workViews.map((view) => ({
            id: view.id,
            label: view.label,
            match: resolveWorkViewMatchV1(view.match),
            pass: recordMatchesWorkView(record ?? params.record, view),
            filters: view.filters_v1 ?? [],
        })),
    };
}
