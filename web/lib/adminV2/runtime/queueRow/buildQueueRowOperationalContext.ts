/**
 * Queue Row Operational Context adapter.
 *
 * The ONLY sanctioned bridge from the existing queue record runtime to the forward-facing
 * `QueueRowOperationalContext` boundary. Queue row widgets observe this contract; they do
 * not consume the raw layout runtime record or placement evaluation directly.
 *
 *   buildOperationalQueueRecordViewModel (layout runtime)
 *     → buildQueueRowOperationalContext (this file)
 *       → Queue Row Widgets
 *
 * @see docs/platform/operator/queue-row-platform.md
 */

import type {
    QueueRowCapabilities,
    QueueRowOperationalContext,
    QueueRowPlacementSignal,
    QueueRowSignals,
    QueueRowSubjectRef,
} from "@/lib/adminV2/runtime/queueRow/queueRowOperationalContext";
import type { PlacementPrioritySnapshot } from "@/lib/orchestration/placement/placementPriorityTypes";
import type {
    OperationalAttentionSignal,
    OperationalTourSignal,
} from "@/lib/adminV2/runtime/operationalContext/types";
import { NULL_PLACEMENT_SIGNAL } from "@/lib/adminV2/runtime/queueRow/queueRowOperationalContext";

export type BuildQueueRowOperationalContextInput = {
    recordId: string;
    recordLabel: string;
    entityType?: "opportunity" | "placement_candidate";
    /** Composed runtime record — all field-level truth for this row. */
    record: Record<string, unknown>;
    /** Operator permission: can write placement overrides from this queue row. */
    canOverridePlacement?: boolean;
    /** Operator permission: can mutate the record from queue row actions. */
    canMutate?: boolean;
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function buildPlacementSignal(record: Record<string, unknown>): QueueRowPlacementSignal {
    const snapshot = record["metadata.placement_priority_v1"] as PlacementPrioritySnapshot | null | undefined;
    if (!snapshot?.bucket_key) return NULL_PLACEMENT_SIGNAL;

    const manualOverride = record["metadata.placement_manual_override"] as
        | { reason?: string; bucket_key?: string; label?: string }
        | null
        | undefined;

    return {
        hasPlacementPriority: true,
        rank: typeof snapshot.bucket_priority_order === "number" ? snapshot.bucket_priority_order : null,
        tierLabel: trimOrNull(snapshot.bucket_label),
        hasManualOverride: Boolean(manualOverride?.bucket_key),
        overrideLabel: trimOrNull(manualOverride?.label) ?? trimOrNull(manualOverride?.reason),
    };
}

function buildAttentionSignal(record: Record<string, unknown>): OperationalAttentionSignal {
    const attention = record["_attention"] as
        | { needs_attention?: boolean; primary_reason?: string; reason_count?: number }
        | null
        | undefined;
    return {
        needsAttention: Boolean(attention?.needs_attention),
        primaryReason: trimOrNull(attention?.primary_reason),
        reasonCount: typeof attention?.reason_count === "number" ? attention.reason_count : 0,
    };
}

function buildTourSignal(record: Record<string, unknown>): OperationalTourSignal {
    const tourBooking = record["_active_tour_booking"] as
        | { start_at?: string; status_key?: string }
        | null
        | undefined;
    return {
        scheduled: Boolean(tourBooking?.start_at),
        startAt: trimOrNull(tourBooking?.start_at),
        statusLabel: trimOrNull(tourBooking?.status_key),
    };
}

/**
 * Project a composed queue record into a `QueueRowOperationalContext`. Pure; safe in
 * `useMemo`. Performs no I/O — the record is already composed upstream.
 */
export function buildQueueRowOperationalContext(
    input: BuildQueueRowOperationalContextInput,
): QueueRowOperationalContext {
    const { record, recordId, recordLabel } = input;

    const subject: QueueRowSubjectRef = {
        type: input.entityType ?? "opportunity",
        id: recordId,
        label: recordLabel,
    };

    const signals: QueueRowSignals = {
        primaryWork: null,
        attention: buildAttentionSignal(record),
        tour: buildTourSignal(record),
        placement: buildPlacementSignal(record),
    };

    const capabilities: QueueRowCapabilities = {
        canOverridePlacement: input.canOverridePlacement ?? false,
        canMutate: input.canMutate ?? false,
    };

    return {
        subject,
        truth: record,
        signals,
        capabilities,
        status: "ready",
    };
}
