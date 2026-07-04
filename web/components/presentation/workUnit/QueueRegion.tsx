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

export function QueueRegion({
    queue,
    selectedRecordId = null,
}: {
    queue: WorkUnitSurfaceModel["queue"];
    /** Currently open inline Focus Panel record — rows render the selected rail. */
    selectedRecordId?: string | null;
}) {
    const { openRecord, prefetchRecord } = useFocusPanelOpen();

    return (
        <section
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.queueRegion)}
            aria-label="Queue"
        >
            {queue.loading ? (
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
            ) : queue.error ? (
                <p
                    role="alert"
                    className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember"
                >
                    {queue.error}
                </p>
            ) : !queue.rows.length ? (
                // Empty state holds the queue STRUCTURE (not a blank space): dashed ghost row
                // outlines show where records would sit, with the message below. Distinct from
                // the loading state (those pulse; these are static dashed placeholders).
                <div
                    className="rounded-lg border border-alloy-stone/30 bg-white p-3"
                    data-queue-empty="true"
                >
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
                <div>
                    <ul role="list" className="flex flex-col gap-2">
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
                    {queue.totalCount != null ? (
                        <p className="px-1 pt-1.5 text-[11px] tabular-nums text-alloy-midnight/60">
                            {queue.totalCount} {queue.totalCount === 1 ? "record" : "records"}
                        </p>
                    ) : null}
                </div>
            )}
        </section>
    );
}
