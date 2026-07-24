/**
 * Decision outcomes (§2) — the outcomes a Processing case can reach besides Approve.
 *
 * The Decision Conversation is not approval-only. Approve stays the primary action and the ONLY
 * one that invokes the Commit Engine; every outcome here performs NO canonical record mutation.
 *
 * Reason sets are configuration-driven with a small, GENERIC canonical fallback — never a
 * globally hardcoded enrollment-specific list. A tenant/form/stage may supply its own reason set;
 * absent that, the canonical fallback applies.
 */

/** The non-approval outcomes an operator can record. `approved` is handled by the commit path, not here. */
export type DecisionOutcome = "rejected" | "needs_more_information" | "unresolved" | "duplicate" | "cancelled";

export const DECISION_OUTCOMES: DecisionOutcome[] = [
    "rejected",
    "needs_more_information",
    "unresolved",
    "duplicate",
    "cancelled",
];

export interface OutcomeReasonOption {
    code: string;
    label: string;
}

export interface DecisionOutcomeSpec {
    outcome: DecisionOutcome;
    /** Operator-facing action label, e.g. "Reject". */
    label: string;
    /** One-line description of what the outcome does. */
    description: string;
    /** Whether a reason code is mandatory for this outcome. */
    requiresReason: boolean;
    /** Terminal outcomes close the case; non-terminal keep it active in a queue. */
    terminal: boolean;
    /** The case status the outcome transitions to. */
    resultStatus: string;
    /** Resolved reason options (configured set if supplied, else the canonical fallback). */
    reasons: OutcomeReasonOption[];
}

/** Static, outcome-level behavior. None of these mutate canonical records — only Approve does. */
const OUTCOME_META: Record<
    DecisionOutcome,
    { label: string; description: string; requiresReason: boolean; terminal: boolean; resultStatus: string }
> = {
    rejected: {
        label: "Reject",
        description: "Decline the proposed action and close the case as rejected.",
        requiresReason: true,
        terminal: true,
        resultStatus: "rejected",
    },
    needs_more_information: {
        label: "Needs more information",
        description: "Record what’s needed and keep the case active in the queue.",
        requiresReason: true,
        terminal: false,
        resultStatus: "needs_review",
    },
    unresolved: {
        label: "Leave unresolved",
        description: "Record that this can’t be decided yet; keep it for further review.",
        requiresReason: false,
        terminal: false,
        resultStatus: "needs_resolution",
    },
    duplicate: {
        label: "Mark duplicate",
        description: "Mark as a duplicate or superseded case; nothing is created.",
        requiresReason: false,
        terminal: true,
        resultStatus: "duplicate",
    },
    cancelled: {
        label: "Cancel case",
        description: "Administratively close for a test, mistake, or superseded work.",
        requiresReason: true,
        terminal: true,
        resultStatus: "cancelled",
    },
};

/** Generic canonical fallback reason sets — deliberately NOT enrollment-specific. */
const CANONICAL_REASONS: Record<DecisionOutcome, OutcomeReasonOption[]> = {
    rejected: [
        { code: "not_a_fit", label: "Not a fit" },
        { code: "duplicate_inquiry", label: "Duplicate inquiry" },
        { code: "spam_or_test", label: "Spam or test submission" },
        { code: "withdrawn", label: "Withdrawn by submitter" },
        { code: "other", label: "Other" },
    ],
    needs_more_information: [
        { code: "missing_details", label: "Missing required details" },
        { code: "missing_contact", label: "Missing contact information" },
        { code: "awaiting_documents", label: "Awaiting documents" },
        { code: "other", label: "Other" },
    ],
    unresolved: [
        { code: "conflicting_evidence", label: "Conflicting evidence" },
        { code: "cannot_determine", label: "Cannot determine" },
        { code: "other", label: "Other" },
    ],
    duplicate: [
        { code: "duplicate_submission", label: "Duplicate submission" },
        { code: "superseded", label: "Superseded by another case" },
        { code: "other", label: "Other" },
    ],
    cancelled: [
        { code: "entered_in_error", label: "Entered in error" },
        { code: "test_or_training", label: "Test or training" },
        { code: "superseded_work", label: "Superseded work" },
        { code: "other", label: "Other" },
    ],
};

/** A configured reason set, e.g. from form/business-process/stage config. Partial — missing outcomes fall back. */
export type ConfiguredReasonSets = Partial<Record<DecisionOutcome, OutcomeReasonOption[]>>;

/** True when a code belongs to the resolved reason set for the outcome. */
export function isValidReasonCode(outcome: DecisionOutcome, code: string, config?: ConfiguredReasonSets): boolean {
    return resolveOutcomeReasons(outcome, config).some((r) => r.code === code);
}

/** Resolve the reason options for an outcome — configured set if non-empty, else canonical fallback. */
export function resolveOutcomeReasons(outcome: DecisionOutcome, config?: ConfiguredReasonSets): OutcomeReasonOption[] {
    const configured = config?.[outcome];
    return configured && configured.length > 0 ? configured : CANONICAL_REASONS[outcome];
}

/** Full spec for one outcome, with reasons resolved. */
export function resolveDecisionOutcomeSpec(outcome: DecisionOutcome, config?: ConfiguredReasonSets): DecisionOutcomeSpec {
    const meta = OUTCOME_META[outcome];
    return { outcome, ...meta, reasons: resolveOutcomeReasons(outcome, config) };
}

/**
 * The outcomes valid for a given Business Process + Stage. Config may restrict the set; absent
 * config, all non-approval outcomes are offered. (Approve is never in this list — it is the
 * separate primary action and the only commit path.)
 */
export function resolveAvailableOutcomes(config?: {
    allowedOutcomes?: DecisionOutcome[];
    reasonSets?: ConfiguredReasonSets;
}): DecisionOutcomeSpec[] {
    const allowed = config?.allowedOutcomes && config.allowedOutcomes.length > 0 ? config.allowedOutcomes : DECISION_OUTCOMES;
    return allowed.map((o) => resolveDecisionOutcomeSpec(o, config?.reasonSets));
}
