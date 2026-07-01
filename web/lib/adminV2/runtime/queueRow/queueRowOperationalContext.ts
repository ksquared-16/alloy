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

import type {
    OperationalAttentionSignal,
    OperationalCommunicationsSignal,
    OperationalGrain,
    OperationalTourSignal,
    OperationalWorkItem,
} from "@/lib/adminV2/runtime/operationalContext/types";

// ─── Subject ────────────────────────────────────────────────────────────────

/**
 * Primary subject of a single queue row.
 *
 * `grain` declares the entity grain:
 * - `"case"` — row represents an Opportunity; `id` is the opportunity_id.
 * - `"child"` — row represents an OCM (child within a case); `id` is the ocm_id;
 *   `caseRef.opportunityId` is required.
 * - `"candidate"` — row represents a PlacementCandidate; `id` is the
 *   placement_candidate_id; both `caseRef` and `childRef` are required.
 *
 * @see docs/platform/operator/operational-grain-doctrine.md §2
 */
export type QueueRowSubjectRef = {
    type: "opportunity" | "opportunity_customer_member" | "placement_candidate";
    grain: OperationalGrain;
    id: string;
    /** Operator-facing display label (household/record title). */
    label: string;
    /** Required when grain !== "case" — links back to the parent case. */
    caseRef?: { opportunityId: string };
    /** Required when grain === "candidate" — links to the child. */
    childRef?: { customerMemberId: string };
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

// ─── Child/Candidate signals ─────────────────────────────────────────────────

/** Status signal for child-grain (OCM) queue rows. */
export type QueueRowChildStatusSignal = {
    /** outcome_status_key for the child's enrollment in this case. */
    outcomeStatusKey: string | null;
    /** Human-readable label for the child's enrollment status. */
    outcomeStatusLabel: string | null;
};

/** Status signal for candidate-grain (placement_candidate) queue rows. */
export type QueueRowCandidateStatusSignal = {
    /** placement_candidate.status: active | paused | withdrawn | placed */
    candidateStatus: "active" | "paused" | "withdrawn" | "placed" | null;
    /** ISO timestamp of when the candidate entered the waitlist. */
    waitSince: string | null;
};

// ─── Signals ────────────────────────────────────────────────────────────────

/**
 * Signals available on a queue row context. Grain-appropriate signals are
 * populated; non-applicable signals are null.
 *
 * Case-grain: `tour`, `communications`, `placement` populated; child/candidate signals null.
 * Child-grain: `childStatus` populated; tour/communications/candidateStatus null.
 * Candidate-grain: `candidateStatus`, `placement` populated; tour/communications/childStatus null.
 */
export type QueueRowSignals = {
    /** Open work item with urgency. Null when grain has no independent work item. */
    primaryWork: OperationalWorkItem | null;
    /** Attention reason + count (all grains). */
    attention: OperationalAttentionSignal;
    /** Next scheduled tour. Null for child/candidate-grain rows (tour belongs to the case). */
    tour: OperationalTourSignal | null;
    /** Placement / waitlist position signal. Null for child-grain rows without placement. */
    placement: QueueRowPlacementSignal | null;
    /** Outreach / scheduled-sends signal. Null for child/candidate-grain rows. */
    communications: OperationalCommunicationsSignal | null;
    /** Child enrollment status. Non-null only for child-grain rows. */
    childStatus: QueueRowChildStatusSignal | null;
    /** Placement candidate status. Non-null only for candidate-grain rows. */
    candidateStatus: QueueRowCandidateStatusSignal | null;
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

export const NULL_COMMUNICATIONS_SIGNAL: OperationalCommunicationsSignal = {
    scheduledSendCount: 0,
    nextFollowUpAt: null,
    hasOutreach: false,
    nextScheduledSendId: null,
};
