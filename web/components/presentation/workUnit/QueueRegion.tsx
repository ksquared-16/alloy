"use client";

/**
 * Presentation Runtime V2 — WU.QUEUE.
 *
 * The one render site for queue rows. Receives the resolved queue slice from the
 * Work Unit surface model and opens records through the FocusPanelSurface seam
 * (`useFocusPanelOpen`). States: loading skeletons, quiet inline error, empty, rows.
 */

import type { WorkUnitSurfaceModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { CondensedQueueRow } from "./CondensedQueueRow";
import { useFocusPanelOpen } from "./FocusPanelSurface";

const QUEUE_SKELETON_ROW_COUNT = 3;

function QueueRowSkeleton() {
    return (
        <li className="flex items-center gap-2 px-3 py-2" aria-hidden>
            <span className="block h-3.5 w-[min(48%,12rem)] animate-pulse rounded bg-alloy-stone/40" />
            <span className="block h-3 w-16 animate-pulse rounded-full bg-alloy-stone/30" />
            <span className="ml-auto block h-3 w-[min(24%,7rem)] animate-pulse rounded bg-alloy-stone/25" />
        </li>
    );
}

export function QueueRegion({ queue }: { queue: WorkUnitSurfaceModel["queue"] }) {
    const { openRecord } = useFocusPanelOpen();

    return (
        <section
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.queueRegion)}
            aria-label="Queue"
        >
            {queue.loading ? (
                <div className="rounded-lg border border-alloy-stone/18 bg-white">
                    <ul role="list" aria-busy="true" aria-label="Loading queue rows" className="divide-y divide-alloy-stone/12">
                        {Array.from({ length: QUEUE_SKELETON_ROW_COUNT }, (_, i) => (
                            <QueueRowSkeleton key={`queue-row-skeleton-${i}`} />
                        ))}
                    </ul>
                </div>
            ) : queue.error ? (
                <p
                    role="alert"
                    className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember"
                >
                    {queue.error}
                </p>
            ) : !queue.rows.length ? (
                <div className="rounded-lg border border-alloy-stone/18 bg-white">
                    <p className="px-3 py-6 text-center text-sm text-alloy-midnight/60">
                        No records in this view
                    </p>
                </div>
            ) : (
                <div className="rounded-lg border border-alloy-stone/18 bg-white">
                    <ul role="list" className="divide-y divide-alloy-stone/12">
                        {queue.rows.map((row, index) => (
                            <li key={`${row.entityType}:${row.entityId}`}>
                                <CondensedQueueRow row={row} onOpen={openRecord} isFirst={index === 0} />
                            </li>
                        ))}
                    </ul>
                    {queue.totalCount != null ? (
                        <p className="border-t border-alloy-stone/12 px-3 py-1.5 text-[11px] tabular-nums text-alloy-midnight/60">
                            {queue.totalCount} {queue.totalCount === 1 ? "record" : "records"}
                        </p>
                    ) : null}
                </div>
            )}
        </section>
    );
}
