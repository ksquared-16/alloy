/**
 * Queue Row Operational Context — the forward-facing runtime boundary for queue row widgets.
 *
 * Mirrors the Focus Panel `OperationalContext` architecture. Queue row widgets observe a
 * `QueueRowOperationalContext`; they do NOT consume the raw layout runtime record or queue
 * view model directly.
 *
 * Canonical spine (doctrine): Queue → Queue Row Operational Context → Queue Row Widgets.
 *
 *   buildOperationalQueueRecordViewModel (layout runtime)
 *     → buildQueueRowOperationalContext (this adapter)
 *       → Queue Row Widgets
 *         → Evidence Builders (pure projections over QueueRowOperationalContext)
 *
 * @see docs/platform/operator/queue-row-platform.md
 */

import type { OperationalAttentionSignal, OperationalTourSignal, OperationalWorkItem } from "@/lib/adminV2/runtime/operationalContext/types";

// ─── Subject ────────────────────────────────────────────────────────────────

export type QueueRowSubjectRef = {
    type: "opportunity" | "placement_candidate";
    id: string;
    /** Operator-facing display label (household/record title). */
    label: string;
};

// ─── Placement ──────────────────────────────────────────────────────────────

export type QueueRowPlacementSignal = {
    /** True when a placement priority V1 evaluation is present. */
    hasPlacementPriority: boolean;
    /** Numeric rank (1 = highest). Null when no evaluation. */
    rank: number | null;
    /** Human-readable tier label: "Priority", "Standard", "Lower Priority", etc. */
    tierLabel: string | null;
    /** Override applied by operator (bypasses rule-based ranking). */
    hasManualOverride: boolean;
    overrideLabel: string | null;
};

// ─── Signals ────────────────────────────────────────────────────────────────

export type QueueRowSignals = {
    /** Open work item with urgency (mirrors Focus Panel work signal). */
    primaryWork: OperationalWorkItem | null;
    /** Attention reason + count (same shape as Focus Panel). */
    attention: OperationalAttentionSignal;
    /** Next scheduled tour (same shape as Focus Panel). */
    tour: OperationalTourSignal;
    /** Placement / waitlist position signal. */
    placement: QueueRowPlacementSignal;
};

// ─── Capabilities ───────────────────────────────────────────────────────────

export type QueueRowCapabilities = {
    /** Whether placement overrides may be written by this operator. */
    canOverridePlacement: boolean;
    /** Whether the operator can mutate this record from the queue row. */
    canMutate: boolean;
};

// ─── Status ─────────────────────────────────────────────────────────────────

export type QueueRowStatus = "ready" | "composing" | "error";

// ─── Context ────────────────────────────────────────────────────────────────

/**
 * The operational context boundary for a single queue row. Widgets observe this;
 * they do not consume the raw queue record layout model or OperationalSubjectViewModel.
 */
export type QueueRowOperationalContext = {
    subject: QueueRowSubjectRef;
    /**
     * Composed record truth — all field-level data for this row. Read once at
     * context construction; widgets never re-fetch.
     */
    truth: Record<string, unknown>;
    signals: QueueRowSignals;
    capabilities: QueueRowCapabilities;
    status: QueueRowStatus;
};

// ─── Null signal helpers ─────────────────────────────────────────────────────

export const NULL_PLACEMENT_SIGNAL: QueueRowPlacementSignal = {
    hasPlacementPriority: false,
    rank: null,
    tierLabel: null,
    hasManualOverride: false,
    overrideLabel: null,
};
