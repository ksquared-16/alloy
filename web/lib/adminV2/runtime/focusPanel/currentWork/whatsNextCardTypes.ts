/**
 * What's Next Card V2 — presentation DTO over existing Current Work runtime.
 *
 * Configuration / stage-work runtime remain the source of operational truth.
 * This model is composition only: compact grammar for progress, context facts,
 * still-needed, activity, and action hierarchy.
 *
 * Summary line is deterministic today (work description / purpose). The same
 * field is the future seam for contextual BOS copy — no AI infrastructure here.
 */

export type WhatsNextProgressMode = "sequential" | "repeated";

export type WhatsNextProgressItemRole = "completed" | "current" | "upcoming";

export type WhatsNextProgressItem = {
    key: string;
    /** Operator-facing label — never a raw template/outcome key. */
    label: string;
    role: WhatsNextProgressItemRole;
    /** Compact status copy ("Completed", "In Progress", "Upcoming"). */
    statusLabel: string;
    /** Optional timestamp or supporting detail under the status. */
    detail?: string | null;
};

export type WhatsNextProgressPresentation = {
    mode: WhatsNextProgressMode;
    items: WhatsNextProgressItem[];
    /**
     * When older history was collapsed to keep the card compact
     * (e.g. "2 earlier attempts completed").
     */
    collapsedEarlierLabel?: string | null;
    /** Repeated-work headline when a total is known (e.g. "2 of 3 attempts"). */
    repeatedHeadline?: string | null;
    /** Compact "what's next" prose for the current step (optional). */
    currentDetail?: string | null;
    /** Compact "what comes after" prose when a next step exists (optional). */
    afterDetail?: string | null;
};

export type WhatsNextContextFact = {
    key: string;
    label?: string | null;
    value: string;
};

export type WhatsNextStillNeededItem = {
    key: string;
    label: string;
};

export type WhatsNextActivityItem = {
    key: string;
    label: string;
    occurredAt?: string | null;
    kind?: string | null;
};

/**
 * Compact presentation model for the What's Next summary card.
 * Actions stay on CurrentWorkSurfaceVM / resolveCurrentWorkActionButtons —
 * this DTO does not duplicate action definitions.
 */
export type WhatsNextCardPresentation = {
    title: string;
    /**
     * One-line operational summary under the title.
     * Deterministic (config description / purpose) today.
     * Future: may accept contextual BOS copy via `summarySource: "contextual"`.
     */
    summaryLine: string | null;
    summarySource: "deterministic" | "contextual";
    statusLabel: string;
    /** Due chip text when meaningful; omit/null when none. */
    dueChip: string | null;
    progress: WhatsNextProgressPresentation | null;
    contextFacts: WhatsNextContextFact[];
    stillNeeded: WhatsNextStillNeededItem[];
    recentActivity: WhatsNextActivityItem[];
};
