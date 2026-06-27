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

export type OperationalContext = {
    subject: OperationalSubjectRef;
    businessProcess: OperationalBusinessProcess;
    perspective: OperationalContextPerspective;
    /**
     * Composed subject truth — observed by cards. Read once at the context level;
     * cards never re-fetch it. (Implementation: the composed subject ViewModel's
     * above-fold record during migration.)
     */
    truth: Record<string, unknown>;
    capabilities: OperationalContextCapabilities;
    status: OperationalContextStatus;
};
