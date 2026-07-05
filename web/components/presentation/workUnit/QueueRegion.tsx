"use client";

/**
 * Presentation Runtime V2 — WU.QUEUE.
 *
 * The one render site for queue rows. Receives the resolved queue slice from the
 * Work Unit surface model and opens records through the FocusPanelSurface seam
 * (`useFocusPanelOpen`). Rows are self-chromed split-view CARDS stacked with small
 * gaps (staging parity) — the region supplies the stack, not row chrome. States:
 * loading skeletons (card-shaped), quiet inline error, empty, rows.
 */

import type { QueueRowModel, WorkUnitSurfaceModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { BUILD_SHA } from "@/lib/runtime/buildInfo";
import { CondensedQueueRow } from "./CondensedQueueRow";
import { useFocusPanelOpen } from "./FocusPanelSurface";

const QUEUE_SKELETON_ROW_COUNT = 3;

/** Card-shaped skeleton — mirrors the split-view card anatomy (avatar + two lines + pill). */
function QueueRowSkeleton() {
    return (
        <li className="rounded-lg border border-alloy-stone/18 bg-white px-3 py-2.5" aria-hidden>
            <span className="flex items-start gap-2.5">
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
    if (queue.error) return "error";
    const hasRows = queue.rows.length > 0;
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
    /** Active Work View label — the queue's title / work-view context header. */
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

    return (
        <section
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.queueRegion)}
            aria-label="Queue"
            data-queue-region
            data-component="QueueRegion"
            data-build-sha={BUILD_SHA}
            data-work-view-id={workViewId ?? undefined}
            data-work-view-name={workView ?? undefined}
            data-work-unit-id={workUnitId ?? undefined}
            data-queue-total={queue.totalCount ?? undefined}
        >
            {/* Queue shell header — a "Queue" eyebrow, the ACTIVE Work View as a filter chip, and the
                record count. Never anonymous: the operator always sees which view + how many. */}
            <div
                data-queue-region-header
                className="mb-2 flex items-center justify-between gap-3"
            >
                <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.13em] text-alloy-midnight/45">
                        Queue
                    </span>
                    <span
                        data-queue-region-title
                        data-queue-filter-chip
                        className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-alloy-stone/45 bg-alloy-stone/[0.06] px-2.5 py-0.5 text-[12px] font-semibold text-alloy-midnight/80"
                        title={workView ? `Active Work View: ${workView}` : "Queue"}
                    >
                        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-alloy-pine" />
                        <span className="truncate">{workView ?? "Queue"}</span>
                    </span>
                </div>
                {queue.totalCount != null ? (
                    <span
                        data-queue-region-count
                        className="shrink-0 rounded-full bg-alloy-midnight/[0.05] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-alloy-midnight/60"
                    >
                        {queue.totalCount} {queue.totalCount === 1 ? "record" : "records"}
                    </span>
                ) : null}
            </div>

            {/* Bordered queue panel — an UNMISTAKABLE outline in EVERY state (defined Alloy stone
                border + soft elevation), so the queue always reads as a contained panel. */}
            <div
                className="rounded-xl border border-alloy-stone/45 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                data-queue-panel
            >
                {renderState === "error" ? (
                    <p
                        role="alert"
                        className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember"
                    >
                        {queue.error}
                    </p>
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
                ) : (
                    // Queue-lane hold: prior rows stay in place during a refetch (aria-busy),
                    // swapping when the new rows arrive — no skeleton flash on a view switch.
                    <ul role="list" aria-busy={queue.loading || undefined} className="flex flex-col gap-2">
                        {queue.rows.map((row, index) => (
                            <li key={`${row.entityType}:${row.entityId}`}>
                                <CondensedQueueRow
                                    row={row}
                                    rowConfig={row.rowConfig ?? queue.rowConfig}
                                    focus={row.focus}
                                    onOpen={openRecord}
                                    onPrefetch={prefetchRecord}
                                    isFirst={index === 0}
                                    isSelected={rowIsSelected(row, selectedRecordId)}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}
