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
    type WorkViewFilterMatch,
} from "@/lib/lifecycle/evaluateWorkViewFiltersV1";
import {
    resolveWorkViewMatchV1,
    type WorkViewConfigV1Stored,
    type WorkViewFilterMatchV1,
    type WorkViewFilterV1,
} from "@/lib/lifecycle/workViewsConfigV1";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { WorkViewGrainBucket } from "@/lib/lifecycle/stageGrainV1";

export type OperationalProjectionRow = Record<string, unknown>;

/**
 * @deprecated Stage is no longer derived from status (S4 collapse). Kept only as a
 * legacy-safety fallback for rows that carry neither `stage_key` nor `lifecycle_stage_key`.
 */
export type StatusStageMap = Record<string, string>;

/**
 * Materialize the process **stage** onto rows so a Work View's Stage predicate (e.g. New Leads =
 * `opportunity_stage equals "lead"`) can evaluate against `lifecycle_stage_key` (the field the
 * evaluator reads).
 *
 * Stage is now a **persisted column** (`stage_key` on opportunities / OCM), written only by outcome
 * execution + intake — it is no longer derived from status. Primary source is `row.stage_key`. The
 * `statusStageMap` param is vestigial and used ONLY as a legacy-safety fallback when a row has neither
 * `lifecycle_stage_key` nor `stage_key` (e.g. un-backfilled legacy rows). Explicit `lifecycle_stage_key`
 * is left untouched.
 */
export function enrichRowsWithDerivedStage<T extends OperationalProjectionRow>(
    rows: readonly T[],
    statusStageMap: StatusStageMap | null | undefined,
): T[] {
    return rows.map((row) => {
        const existing =
            typeof row.lifecycle_stage_key === "string" && row.lifecycle_stage_key.trim()
                ? row.lifecycle_stage_key
                : null;
        if (existing) return row;
        // Primary source: the persisted stage_key column.
        const persistedStage =
            typeof row.stage_key === "string" && row.stage_key.trim() ? row.stage_key.trim() : null;
        if (persistedStage) return { ...row, lifecycle_stage_key: persistedStage } as T;
        // Legacy-safety fallback only: derive from status when no persisted stage exists.
        if (!statusStageMap) return row;
        const status = typeof row.status_key === "string" ? row.status_key.trim() : "";
        const stage = status ? statusStageMap[status] : undefined;
        return stage ? ({ ...row, lifecycle_stage_key: stage } as T) : row;
    });
}

/**
 * Apply Work View predicates to queue rows on the canonical operational projection path:
 * materialize `lifecycle_stage_key` from persisted `stage_key`, then evaluate filters.
 * Queue API and operational projection must both call this — never filter raw rows directly.
 */
export function filterQueueRowsForWorkView<T extends OperationalProjectionRow>(
    rows: readonly T[],
    filters: readonly WorkViewFilterV1[] | null | undefined,
    match: WorkViewFilterMatch = "all",
    statusStageMap?: StatusStageMap | null,
): T[] {
    return filterQueueRowsByWorkViewFilters(
        enrichRowsWithDerivedStage(rows, statusStageMap),
        filters,
        match,
    );
}

/** Max base rows fetched before Work View predicates on the queue API path. */
export const WORK_VIEW_QUEUE_FILTER_FETCH_CAP = 500;

/** Minimal queue page shape — generic `R` preserves extra fields such as `queue` on {@link QueueItemsResult}. */
type WorkViewFilterableQueuePage = {
    items: unknown[];
    total?: number;
    limit?: number;
    offset?: number;
    total_omitted?: boolean;
};

/**
 * Apply Work View predicates to a fetched lane page, returning the requested page slice and the
 * **true** filtered total (full filtered set length, not the current page length).
 */
export function applyWorkViewFilterToQueueItemsResult<R extends WorkViewFilterableQueuePage>(args: {
    result: R;
    filters: readonly WorkViewFilterV1[];
    match?: WorkViewFilterMatch;
    pageLimit?: number;
    pageOffset?: number;
    omitTotalCount?: boolean;
    statusStageMap?: StatusStageMap | null;
}): R {
    const filtered = filterQueueRowsForWorkView(
        args.result.items as OperationalProjectionRow[],
        args.filters,
        args.match ?? "all",
        args.statusStageMap,
    );
    const pageOffset = args.pageOffset ?? 0;
    const pageLimit = args.pageLimit ?? filtered.length;
    const includeTotal = !args.omitTotalCount;
    const page: WorkViewFilterableQueuePage = {
        ...args.result,
        items: filtered.slice(pageOffset, pageOffset + pageLimit),
        total: includeTotal ? filtered.length : args.result.total,
        limit: args.pageLimit ?? args.result.limit,
        offset: args.pageOffset ?? args.result.offset,
    };
    if (includeTotal) delete page.total_omitted;
    return page as R;
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
    /** @deprecated Legacy-safety fallback only — stage now comes from the persisted `stage_key` column (see enrichRowsWithDerivedStage). */
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
    /** Case/family-grain rows in this view (when mixed or family-only). */
    primaryGrainCount: number | null;
    /** Child/candidate-grain rows in this view (when mixed). */
    supportingGrainCount: number | null;
    /** Grain bucket for the primary count — drives presentation labels only. */
    primaryGrainKind: WorkViewGrainBucket | null;
    /** Grain bucket for the supporting count when dual-grain. */
    supportingGrainKind: WorkViewGrainBucket | null;
};

const OVERDUE_DUE_LABEL = "Overdue";

/** Bucket one queue row into family (case) vs child/candidate grain for tile breakdown. */
function grainBucketForQueueRow(ctx: QueueRowContext): "family" | "child" | null {
    const unit = ctx.row_count_unit;
    if (unit === "cases") return "family";
    if (unit === "children" || unit === "enrollment_track" || unit === "candidates") return "child";
    if (ctx.row_presentation_mode === "grouped_subjects") return "family";
    if (ctx.row_subjects && ctx.row_subjects.length > 1) return "family";
    return "child";
}

function grainContribution(ctx: QueueRowContext, bucket: "family" | "child"): number {
    if (bucket === "family") return 1;
    if (typeof ctx.row_count === "number" && ctx.row_count > 0) return ctx.row_count;
    if (ctx.row_subjects?.length) return ctx.row_subjects.length;
    return 1;
}

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
        let familyCount = 0;
        let childCount = 0;
        for (const row of view.rows) {
            const ctx = (row as { _queue_row_context?: QueueRowContext })._queue_row_context;
            if (!ctx) continue;
            if (ctx.attention_summary?.needs_attention === true) attentionCount += 1;
            if (ctx.current_work_summary?.due_label === OVERDUE_DUE_LABEL) overdueCount += 1;
            const bucket = grainBucketForQueueRow(ctx);
            if (bucket === "family") familyCount += grainContribution(ctx, "family");
            else if (bucket === "child") childCount += grainContribution(ctx, "child");
        }
        let primaryGrainCount: number | null = null;
        let supportingGrainCount: number | null = null;
        let primaryGrainKind: WorkViewGrainBucket | null = null;
        let supportingGrainKind: WorkViewGrainBucket | null = null;
        if (familyCount > 0 && childCount > 0) {
            primaryGrainCount = familyCount;
            supportingGrainCount = childCount;
            primaryGrainKind = "family";
            supportingGrainKind = "child";
        } else if (childCount > 0) {
            primaryGrainCount = childCount;
            primaryGrainKind = "child";
        } else if (familyCount > 0) {
            primaryGrainCount = familyCount;
            primaryGrainKind = "family";
        }
        out[view.id] = {
            attentionCount,
            overdueCount,
            primaryGrainCount,
            supportingGrainCount,
            primaryGrainKind,
            supportingGrainKind,
        };
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
    statusStageMap?: StatusStageMap | null,
): boolean {
    if (!view) return true;
    const [enriched] = enrichRowsWithDerivedStage([record], statusStageMap);
    return evaluateWorkViewFiltersForRow(
        enriched ?? record,
        view.filters_v1,
        resolveWorkViewMatchV1(view.match),
    ).pass;
}

/**
 * First configured Work View whose predicates match the record — prefers predicate-scoped views
 * over include-all views so Open Record routes into the narrowest matching process context.
 */
export function firstMatchingVisibleWorkView(
    record: OperationalProjectionRow,
    workViews: readonly WorkViewConfigV1Stored[],
): WorkViewConfigV1Stored | null {
    const visible = workViews.filter((view) => view.visible_in_runtime !== false);
    const withPredicates = visible.filter((view) => (view.filters_v1?.length ?? 0) > 0);
    for (const view of withPredicates) {
        if (recordMatchesWorkView(record, view)) return view;
    }
    return visible.find((view) => !(view.filters_v1?.length ?? 0)) ?? null;
}

export type FocusPanelScopeState =
    | { kind: "in_scope" }
    | { kind: "no_active_view" }
    | {
          kind: "out_of_scope";
          activeViewId: string;
          activeViewLabel: string;
          /** Destination Work View the record now matches (for Open-in affordance). */
          destinationViewId?: string | null;
          destinationViewLabel?: string | null;
      };

/**
 * Classify a deep-linked record against the active Work View so the UI can show an explicit
 * "record has moved" state (with an Open-in destination action) instead of silently
 * showing a record the active queue counts as 0.
 */
export function resolveFocusPanelScope(params: {
    record: OperationalProjectionRow | null | undefined;
    activeView: WorkViewConfigV1Stored | null | undefined;
    /** All configured Work Views — used to name the destination when out of the active view. */
    workViews?: readonly WorkViewConfigV1Stored[] | null;
}): FocusPanelScopeState {
    const { record, activeView } = params;
    if (!activeView) return { kind: "no_active_view" };
    if (!record) return { kind: "in_scope" }; // record not yet loaded — don't assert out-of-scope
    if (recordMatchesWorkView(record, activeView)) return { kind: "in_scope" };

    const others = (params.workViews ?? []).filter(
        (view) => view.id !== activeView.id && view.visible_in_runtime !== false,
    );
    const destination = firstMatchingVisibleWorkView(record, others);
    return {
        kind: "out_of_scope",
        activeViewId: activeView.id,
        activeViewLabel: activeView.label,
        destinationViewId: destination?.id ?? null,
        destinationViewLabel: destination?.label ?? null,
    };
}

/** Operator copy for a record that left the active Work View after stage movement. */
export function formatRecordMovedOutOfViewMessage(params: {
    destinationViewLabel?: string | null;
}): { body: string; cta: string | null } {
    const dest = params.destinationViewLabel?.trim() || null;
    if (dest) {
        return {
            body: `This record has moved to ${dest}.`,
            cta: `Open in ${dest}`,
        };
    }
    return {
        body: "This record is no longer in the current Work View.",
        cta: null,
    };
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
