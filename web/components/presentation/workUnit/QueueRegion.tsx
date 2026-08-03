"use client";

/**
 * Presentation Runtime V2 — WU.QUEUE.
 *
 * The one render site for queue rows. Receives the resolved queue slice from the
 * Work Unit surface model and opens records through the FocusPanelSurface seam
 * (`useFocusPanelOpen`). The entire Queue Region is ONE bordered pane (search, filters,
 * rows, empty/loading states) — a sibling to the Focus Panel with aligned top/bottom
 * edges. The active Work View pill already names the queue, so the pane has no redundant
 * title/count header — only a compact Search/Filters utility bar, then rows.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { QueueRowModel, WorkUnitSurfaceModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { BUILD_SHA } from "@/lib/runtime/buildInfo";
import {
    applyQueueRowFilters,
    deriveQueueRowFilterFacets,
    queueRowFilterFromDrillParams,
    queueRowFilterIsActive,
    EMPTY_QUEUE_ROW_FILTER,
    type QueueRowFilterState,
} from "@/lib/presentation/runtime/queueRowFilter";
import { WS_QUEUE_TOOLBAR_CHROME } from "@/components/workspace/workspaceTokens";
import { markPerceived } from "@/lib/perf/perceivedPerf";
import { CondensedQueueRow } from "./CondensedQueueRow";
import { QueueFilterControls } from "./QueueFilterControls";
import { useFocusPanelOpen } from "./FocusPanelSurface";
import { queueRowsForListDuringHold } from "@/lib/presentation/runtime/queueRowsRetention";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { useRetainedScroll } from "@/lib/presentation/runtime/useRetainedScroll";
import { queueScrollScope } from "@/lib/presentation/runtime/workUnitOperatorContext";
import {
    acknowledgeQueueRowOpened,
    hydrateOccurrencesSeenLocally,
    occurrenceKeyFromQueueRowContext,
    useLocallySeenOccurrenceCount,
} from "@/lib/queues/queuePersonalSeenSession";

const QUEUE_SKELETON_ROW_COUNT = 3;

/** Card-shaped skeleton — mirrors the split-view card anatomy (avatar + two lines + pill). */
function QueueRowSkeleton() {
    return (
        <li className="rounded-lg border border-alloy-stone/16 bg-white px-2.5 py-2" aria-hidden>
            <span className="flex items-start gap-2">
                <span className="block h-8 w-8 shrink-0 animate-pulse rounded-full bg-alloy-stone/30" />
                <span className="min-w-0 flex-1 space-y-1.5">
                    <span className="flex items-center justify-between gap-2">
                        <span className="block h-3.5 w-[min(48%,10rem)] animate-pulse rounded bg-alloy-stone/40" />
                        <span className="block h-3 w-14 shrink-0 animate-pulse rounded-full bg-alloy-stone/30" />
                    </span>
                    <span className="block h-3 w-[min(64%,14rem)] animate-pulse rounded bg-alloy-stone/25" />
                </span>
            </span>
        </li>
    );
}

/**
 * A row is selected when its identity matches the open Focus Panel record — either the
 * row's own entity id or the frozen contract's `drawer_open` anchor (grouped rows open
 * their case opportunity, so the anchor is the id the drawer store holds).
 */
function rowIsSelected(row: QueueRowModel, selectedRecordId: string | null): boolean {
    if (!selectedRecordId) return false;
    return (
        row.entityId === selectedRecordId ||
        row.context?.drawer_open.entity_id === selectedRecordId
    );
}

export type QueueRegionRenderState = "error" | "cold-loading" | "empty" | "rows";

/**
 * Queue-lane hold decision (adminv2-runtime-performance-doctrine §Queue). The runtime never
 * clears the prior rows before the next fetch settles, so on a Work View switch (same host
 * work unit) or a live refresh the rows are still present and we HOLD them — swapping in place
 * when the new rows arrive, never a skeleton flash. Contract:
 *  - a real error always surfaces (never hidden behind stale rows);
 *  - the row skeleton is reserved for the COLD first load (loading with nothing to hold);
 *  - `"rows"` covers both the settled state and the held-during-refetch state.
 */
export function queueRegionRenderState(queue: {
    rows: readonly unknown[];
    loading: boolean;
    error: string | null;
}): QueueRegionRenderState {
    const hasRows = queue.rows.length > 0;
    // Hard error with nothing to hold — full error surface. When rows exist, hold them and
    // surface the error inline (never drop to empty/skeleton).
    if (queue.error && !hasRows) return "error";
    if (queue.loading && !hasRows) return "cold-loading";
    if (!hasRows) return "empty";
    return "rows";
}

export function QueueRegion({
    queue,
    title = null,
    selectedRecordId = null,
    workViewId = null,
    workUnitId = null,
}: {
    queue: WorkUnitSurfaceModel["queue"];
    /** Active Work View label — diagnostic/aria context only (not rendered as a title). */
    title?: string | null;
    /** Currently open inline Focus Panel record — rows render the selected rail. */
    selectedRecordId?: string | null;
    /** Active Work View id — surfaced as a debug marker so the render path is provable. */
    workViewId?: string | null;
    /** Host Work Unit id — debug marker. */
    workUnitId?: string | null;
}) {
    const { openRecord, prefetchRecord } = useFocusPanelOpen();
    const renderState = queueRegionRenderState(queue);
    const workView = title?.trim() || null;

    // ── IMMEDIATE SELECTION ACKNOWLEDGMENT (Kelly Blocker 1) ──────────────────────────────────────
    // The row's selected rail + acknowledge pulse are driven by `selectedRecordId`, which is the
    // COMMITTED subject — so on a click they only lit up once Focus committed (a felt ~seconds of "did
    // it register?"). Track the clicked row optimistically and mark it selected the instant the pointer
    // acts, before commit. It is NOT a second subject owner: it only paints the row rail early; the
    // committed truth takes over the moment it lands, and a mismatch self-heals (a superseding click
    // moves the optimistic id; the committed id always wins for everything else).
    const [optimisticSelectedId, setOptimisticSelectedId] = useState<string | null>(null);
    useEffect(() => {
        // The committed selection has caught up (or moved elsewhere) — drop the optimistic overlay.
        if (optimisticSelectedId && selectedRecordId != null && selectedRecordId === optimisticSelectedId) {
            setOptimisticSelectedId(null);
        }
    }, [selectedRecordId, optimisticSelectedId]);
    const { orgId, principalUserId } = useWorkspaceOrg();
    const locallySeenCount = useLocallySeenOccurrenceCount();
    const queueScrollRef = useRetainedScroll(queueScrollScope(orgId, workUnitId, workViewId));

    const openRecordAck = useCallback(
        (row: QueueRowModel) => {
            setOptimisticSelectedId(row.entityId);
            // Intentional row activation (pointer or keyboard) — mark personal seen.
            // Prefetch / default auto-open do not call this path.
            if (orgId && principalUserId && row.context) {
                void acknowledgeQueueRowOpened({
                    orgId,
                    userId: principalUserId,
                    context: row.context,
                });
            }
            openRecord(row);
        },
        [openRecord, orgId, principalUserId],
    );
    const effectiveSelectedId = optimisticSelectedId ?? selectedRecordId;

    const lastMarkedQueueStateRef = useRef<string | null>(null);
    useEffect(() => {
        const held = renderState === "rows" && queue.loading;
        const key = `${renderState}:${held ? "held" : "settled"}`;
        if (lastMarkedQueueStateRef.current === key) return;
        lastMarkedQueueStateRef.current = key;
        const signal =
            renderState === "cold-loading"
                ? "intent"
                : held
                  ? "hold_start"
                  : renderState === "rows"
                    ? "reveal"
                    : "hold_end";
        markPerceived("queue_hold", signal, {
            render_state: renderState,
            work_unit_id: workUnitId ?? undefined,
            view_id: workViewId ?? undefined,
        });
    }, [renderState, queue.loading, workUnitId, workViewId]);

    // Interactive filter/control row (re-homed from the pre-PRV2 WorkUnitQueueRecordFilterBar):
    // client-side narrowing over the loaded rows, facets derived from what's loaded. Server order
    // is preserved until the operator picks a sort.
    // A metric/KPI drill lands here carrying its semantic filter in query state (status_keys /
    // attention_reason_code). Seed the queue filter from it on arrival, and re-apply when the drill
    // query changes (navigation) — a plain view/pill/direct link (no drill query) resets to none.
    // Manual filter edits (which never touch the URL) are preserved between navigations.
    const searchParams = useSearchParams();
    const drillQueryString = searchParams?.toString() ?? "";
    const drillFilterKey = `${searchParams?.get("status_keys") ?? ""}|${searchParams?.get("attention_reason_code") ?? ""}`;
    const [filters, setFilters] = useState<QueueRowFilterState>(() =>
        queueRowFilterFromDrillParams(new URLSearchParams(drillQueryString)),
    );
    useEffect(() => {
        setFilters(queueRowFilterFromDrillParams(new URLSearchParams(drillQueryString)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drillFilterKey]);
    // Work View switch resets client filters so held rows are not hidden during destination fetch.
    useEffect(() => {
        setFilters(queueRowFilterFromDrillParams(new URLSearchParams(drillQueryString)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workViewId]);
    const facets = useMemo(() => deriveQueueRowFilterFacets(queue.rows), [queue.rows]);
    const visibleRows = useMemo(() => applyQueueRowFilters(queue.rows, filters), [queue.rows, filters]);
    // Hydrate personal seen for visible occurrence keys (stale refresh cannot revive cleared dots).
    useEffect(() => {
        if (!orgId || !principalUserId || !queue.rows.length) return;
        const keys = queue.rows
            .map((row) => occurrenceKeyFromQueueRowContext(row.context, principalUserId, orgId))
            .filter((k): k is string => Boolean(k));
        if (!keys.length) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch(
                    `/api/admin/queues/stage-membership-ack?keys=${encodeURIComponent(keys.join(","))}`,
                );
                if (!res.ok || cancelled) return;
                const body = (await res.json()) as { occurrence_keys?: string[] };
                if (!cancelled && Array.isArray(body.occurrence_keys)) {
                    hydrateOccurrencesSeenLocally(body.occurrence_keys);
                }
            } catch {
                // Ignore hydration failures — local session still protects post-open clears.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [orgId, principalUserId, queue.rows]);
    const holdActive = queue.loading && queue.rows.length > 0;
    const rowsForList = queueRowsForListDuringHold({
        queueRows: queue.rows,
        visibleRows,
        loading: queue.loading,
        filterActive: queueRowFilterIsActive(filters),
    });
    const filterActive = queueRowFilterIsActive(filters);
    // Canonical queue controls appear whenever the view has resolved (rows OR a settled empty
    // view) — never disappearing on an empty queue or a specific Work View. Hidden only during
    // the cold first load and hard errors.
    const showFilterControls = renderState === "rows" || renderState === "empty";

    return (
        <section
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.queueRegion)}
            aria-label={workView ? `Queue: ${workView}` : "Queue"}
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-alloy-midnight/25 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
            data-queue-region
            data-queue-region-boundary
            data-queue-panel
            data-component="QueueRegion"
            data-build-sha={BUILD_SHA}
            data-work-view-id={workViewId ?? undefined}
            data-work-view-name={workView ?? undefined}
            data-work-unit-id={workUnitId ?? undefined}
            data-queue-total={queue.totalCount ?? undefined}
            // P2-V config-consumption provenance — proves in the browser WHICH surface drove the rows.
            data-queue-row-source={queue.provenance?.source ?? undefined}
            data-queue-surface-id={queue.provenance?.surfaceId ?? undefined}
            data-queue-surface-source={queue.provenance?.resolvedSource ?? queue.provenance?.source ?? undefined}
            data-queue-surface-variant={queue.provenance?.variant ?? undefined}
            data-queue-column-keys={
                [
                    ...(queue.rowConfig?.subject.fieldKeys ?? []),
                    ...(queue.rowConfig?.status.fieldKeys ?? []),
                    ...(queue.rowConfig?.contact.fieldKeys ?? []),
                    ...(queue.rowConfig?.attention.fieldKeys ?? []),
                    ...(queue.rowConfig?.work.fieldKeys ?? []),
                    ...(queue.rowConfig?.groupCount.fieldKeys ?? []),
                ].join("|") || undefined
            }
            data-queue-row-resolved-source={queue.provenance?.resolvedSource ?? undefined}
            data-queue-row-variant={queue.provenance?.variant ?? undefined}
            data-queue-row-ineffective-fields={
                queue.provenance?.ineffectiveFieldKeys?.length
                    ? queue.provenance.ineffectiveFieldKeys.join(",")
                    : undefined
            }
        >
            {showFilterControls ? (
                <div
                    className={`shrink-0 px-3 py-2 pb-3 ${WS_QUEUE_TOOLBAR_CHROME}`}
                    data-queue-region-header
                    data-queue-region-controls
                >
                    <QueueFilterControls
                        facets={facets}
                        filters={filters}
                        onChange={setFilters}
                        onClear={() => setFilters(EMPTY_QUEUE_ROW_FILTER)}
                        matchedCount={visibleRows.length}
                        loadedCount={queue.rows.length}
                        disabled={queue.loading}
                    />
                </div>
            ) : null}

            <div ref={queueScrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-2.5" data-queue-panel-body>
                {renderState === "error" ? (
                    /* A refusal names WHAT KIND of problem it is. Before this, a tenant configuration
                       problem and a missing record were the same anonymous red sentence, so an operator
                       could not tell "someone has to fix this Work View" from "nothing is here". The
                       lead line is the classification; the answer's own message stays verbatim beneath it,
                       because it is the only thing that says WHICH Work View and WHY. */
                    <div
                        role="alert"
                        data-queue-error-kind={queue.errorKind ?? "unclassified"}
                        className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember"
                    >
                        {queue.errorKind === "configuration" ? (
                            <p className="font-medium">This Work View can’t be shown until its configuration is fixed.</p>
                        ) : queue.errorKind === "subject" ? (
                            <p className="font-medium">That record isn’t in this Work View.</p>
                        ) : queue.errorKind === "records" ? (
                            <p className="font-medium">These records couldn’t be loaded.</p>
                        ) : queue.errorKind === "authorization" ? (
                            <p className="font-medium">You don’t have access to this Work View.</p>
                        ) : null}
                        <p className={queue.errorKind ? "mt-1 text-alloy-ember/80" : undefined}>{queue.error}</p>
                        {/* No "try another Work View" hint here on purpose: the exit is the pill strip,
                            which the surface model now carries through a refusal. Passing the lens set
                            into the queue region just to word a hint would couple this component to
                            navigation it does not own. */}
                    </div>
                ) : renderState === "cold-loading" ? (
                    <ul
                        role="list"
                        aria-busy="true"
                        aria-label="Loading queue rows"
                        className="flex flex-col gap-2"
                    >
                        {Array.from({ length: QUEUE_SKELETON_ROW_COUNT }, (_, i) => (
                            <QueueRowSkeleton key={`queue-row-skeleton-${i}`} />
                        ))}
                    </ul>
                ) : renderState === "empty" ? (
                    // Empty state holds the queue STRUCTURE: dashed ghost rows inside the panel.
                    <div data-queue-empty="true">
                        <ul className="flex flex-col gap-2" aria-hidden="true">
                            {Array.from({ length: QUEUE_SKELETON_ROW_COUNT }, (_, i) => (
                                <li
                                    key={`queue-empty-ghost-${i}`}
                                    className="h-[3.25rem] rounded-lg border border-dashed border-alloy-stone/35 bg-alloy-stone/[0.03]"
                                />
                            ))}
                        </ul>
                        <p className="mt-3 text-center text-sm text-alloy-midnight/50">
                            No records in this view
                        </p>
                    </div>
                ) : filterActive && visibleRows.length === 0 && !holdActive ? (
                    // Rows exist but the operator's filter matched none — hold the board, offer a reset.
                    <div data-queue-no-matches="true" className="py-6 text-center">
                        <p className="text-sm text-alloy-midnight/55">No records match your filters</p>
                        <button
                            type="button"
                            onClick={() => setFilters(EMPTY_QUEUE_ROW_FILTER)}
                            className="mt-2 rounded-md px-2.5 py-1 text-[12px] font-semibold text-alloy-pine hover:bg-alloy-pine/10"
                        >
                            Clear filters
                        </button>
                    </div>
                ) : (
                    // Queue-lane hold: prior rows stay in place during a refetch (aria-busy),
                    // swapping when the new rows arrive — no skeleton flash on a view switch.
                    <>
                        {queue.error ? (
                            <p
                                role="alert"
                                className="mb-2 rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember"
                            >
                                {queue.error}
                            </p>
                        ) : null}
                        <ul role="list" aria-busy={queue.loading || undefined} className="flex flex-col gap-2">
                        {rowsForList.map((row, index) => (
                            <li key={`${row.entityType}:${row.entityId}`}>
                                <CondensedQueueRow
                                    row={row}
                                    rowConfig={row.rowConfig ?? queue.rowConfig}
                                    focus={row.focus}
                                    onOpen={openRecordAck}
                                    onPrefetch={prefetchRecord}
                                    isFirst={index === 0}
                                    isSelected={rowIsSelected(row, effectiveSelectedId)}
                                />
                            </li>
                        ))}
                        </ul>
                    </>
                )}
            </div>
        </section>
    );
}
