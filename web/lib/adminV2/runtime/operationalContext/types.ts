import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";

/**
 * Operational Context — the forward-facing runtime boundary for cards.
 *
 * Canonical spine (doctrine): Queue → Operational Context → Focus Panel → Cards.
 * Cards observe an `OperationalContext`; they do NOT consume drawer terminology
 * (`drawerId`, `displayVm`, `DrawerTabKey`) or LayoutDoc/drawer-body abstractions.
 *
 * This type is intentionally small. The composed subject ViewModel remains the
 * internal implementation of `truth` during migration — see
 * `buildOperationalContext.ts` (the adapter) — but the shape cards depend on is
 * this contract.
 *
 * @see docs/platform/operator/operational-context-boundary.md
 * @see docs/platform/operator/household-reference-card.md
 */

export type OperationalSubjectRef = {
    /** Entity type of the subject (e.g. "opportunity", "person"). */
    type: string;
    id: string;
    /** Operator-facing label (household / person / record title). */
    label: string;
};

export type OperationalBusinessProcess = {
    key: string | null;
    label: string | null;
    /** Current builder stage key, when known. */
    stageKey: string | null;
};

export type OperationalContextPerspective = {
    /** Mission line for the active operational view, when known. */
    missionLabel: string | null;
} | null;

export type OperationalContextCapabilities = {
    /** Whether the operator may mutate this subject (server-resolved). */
    canMutate: boolean;
    /** Whether contact channels / sensitive fields must be masked for this operator. */
    maskedChannels: boolean;
};

export type OperationalContextStatus =
    | "ready"
    | "composing"
    | "error"
    | "permission_limited";

/**
 * Operational signals — the composed-but-not-flat operational truth cards observe.
 *
 * `truth` is the subject's field bag (the above-fold record). Some operational
 * facts are not flat record fields — open work, attention, scheduled tour — they
 * are composed upstream. The adapter (`buildOperationalContext`) projects them
 * here so Work / Intelligence cards observe the Operational Context, never the
 * drawer VM. These are read-once derivations; cards never fetch or recompute.
 */
export type OperationalWorkItemState = "open" | "completed" | "planned";
export type OperationalWorkUrgency = "overdue" | "today" | "upcoming" | null;
export type OperationalWorkItemKind = "stage_work" | "task";

export type OperationalWorkItem = {
    id: string;
    label: string;
    state: OperationalWorkItemState;
    /** Human due label ("Due today", "Overdue 2 days", "Due Jun 30"), null when none. */
    dueLabel: string | null;
    /** Raw due timestamp/date, null when none. */
    dueAt: string | null;
    urgency: OperationalWorkUrgency;
    /** Origin ("BOS Assist", "workflow", "manual"), null when unknown. */
    source: string | null;
    kind: OperationalWorkItemKind;
};

export type OperationalWorkSignal = {
    /** Most-urgent open item — the single answer for Current Work overview. */
    primary: OperationalWorkItem | null;
    /** All open/active work items (stage work + operational tasks). */
    items: OperationalWorkItem[];
    openCount: number;
    overdueCount: number;
    /** Configured next action label (header action), null when none. */
    nextActionLabel: string | null;
};

export type OperationalAttentionSignal = {
    needsAttention: boolean;
    primaryReason: string | null;
    reasonCount: number;
};

export type OperationalTourSignal = {
    scheduled: boolean;
    startAt: string | null;
    statusLabel: string | null;
    /** ID of the active tour_bookings row — present when scheduled=true, null otherwise. */
    bookingId: string | null;
};

export type OperationalCommunicationsSignal = {
    /** Number of outgoing messages scheduled for future delivery. */
    scheduledSendCount: number;
    /** ISO timestamp of the next configured follow-up, null when none. */
    nextFollowUpAt: string | null;
    /** True when there is any scheduled send or pending follow-up. */
    hasOutreach: boolean;
    /** ID of the next pending scheduled send, null when none. Used for cancel action. */
    nextScheduledSendId: string | null;
};

/**
 * Billing signal — projected billing configuration facts for the subject case.
 * Deferred (read-only) until the billing assignment write path exists.
 * @see docs/platform/operator/operational-grain-doctrine.md §7
 */
export type OperationalBillingSignal = {
    /** True when the billing_configured flag is set on the composed record. */
    billingConfigured: boolean;
    billingContactName: string | null;
    billingContactEmail: string | null;
    tuitionRateLabel: string | null;
    /** Fee balance in cents, null when not present or not applicable. */
    feeBalanceCents: number | null;
};

/** Null-state billing signal for fixtures and contexts without billing data. */
export const NULL_BILLING_SIGNAL: OperationalBillingSignal = {
    billingConfigured: false,
    billingContactName: null,
    billingContactEmail: null,
    tuitionRateLabel: null,
    feeBalanceCents: null,
};

export type OperationalContextSignals = {
    work: OperationalWorkSignal;
    attention: OperationalAttentionSignal;
    tour: OperationalTourSignal;
    communications: OperationalCommunicationsSignal;
    /** Billing configuration signal (read-only projection; deferred mutation). */
    billing: OperationalBillingSignal;
};

/**
 * The operational grain of this context.
 *
 * - `"case"` — subject is an Opportunity (household/family). All Focus Panel
 *   contexts are case-grain.
 * - `"child"` — subject is an OCM (child within a case). Not yet used in the
 *   Focus Panel; reserved for child-grain queue row contexts.
 * - `"candidate"` — subject is a PlacementCandidate. Reserved for candidate-
 *   grain queue row contexts (Waitlist queue).
 *
 * @see docs/platform/operator/operational-grain-doctrine.md §1
 */
export type OperationalGrain = "case" | "child" | "candidate";

export type OperationalContext = {
    /** Grain of this context — always "case" in the Focus Panel. */
    grain: OperationalGrain;
    subject: OperationalSubjectRef;
    businessProcess: OperationalBusinessProcess;
    perspective: OperationalContextPerspective;
    /**
     * Composed subject truth — observed by cards. Read once at the context level;
     * cards never re-fetch it. (Implementation: the composed subject ViewModel's
     * above-fold record during migration.)
     */
    truth: Record<string, unknown>;
    /**
     * Projected operational signals (work / attention / tour) for cards whose
     * answer is not a flat record field. @see OperationalContextSignals.
     */
    signals: OperationalContextSignals;
    /**
     * Stage operating-plan runtime projection — read-only source for Current Work.
     * Populated by `buildOperationalContext`; cards never fetch this separately.
     */
    stageWorkRuntime?: StageWorkRuntimeProjection | null;
    /**
     * Registry-backed record_header action slots — supporting actions for Current Work.
     * Populated by `buildOperationalContext`; cards never fetch separately.
     */
    recordHeaderActions?: ResolvedActionsBySlot | null;
    capabilities: OperationalContextCapabilities;
    status: OperationalContextStatus;
};
