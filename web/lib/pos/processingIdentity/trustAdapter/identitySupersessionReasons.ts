/**
 * Why a governed identity judgment stopped being current — as a CLOSED category.
 *
 * Processing owns this vocabulary because Processing owns the actions it
 * describes. The categories are derived from the decision actions that
 * `recordResolutionDecision` and `applyCommitSelectionToResolutions` actually
 * write, not invented for Trust's benefit.
 *
 * **No operator prose ever reaches Trust.** `provisional.create_new_override.reason`
 * is free text an operator typed; it may name a person, quote an email, or
 * describe a family. It stays in Processing's own audit under Processing's own
 * policy. Trust receives only the category below — a fixed token with no
 * parameter through which a subject value could enter.
 *
 * An unrecognised action maps to `operator_corrected_identity` rather than
 * widening the set silently: the truthful statement is still that an operator
 * changed the authoritative identity result.
 *
 * A leaf module. No imports, so nothing can smuggle a value in through one.
 */

export const IDENTITY_SUPERSESSION_REASONS = [
    /** The operator confirmed an existing record (`link_existing` / `update_existing`). */
    "operator_confirmed_existing",
    /** The operator chose to create a new record (`create_new`). */
    "operator_confirmed_new",
    /** The operator rejected the candidate set (`reject`). */
    "operator_rejected_candidate",
    /** The operator asked for more information (`request_information`). */
    "operator_requested_information",
    /** The operator sent the subject back for review or escalation. */
    "operator_deferred_decision",
    /** The operator changed the authoritative result in a way not otherwise categorised. */
    "operator_corrected_identity",
    /** A replacement deterministic generation produced a newer governed judgment. */
    "replacement_engine_generation",
] as const;

export type IdentitySupersessionReason = (typeof IDENTITY_SUPERSESSION_REASONS)[number];

const REASON_BY_DECISION_ACTION: Readonly<Record<string, IdentitySupersessionReason>> = {
    link_existing: "operator_confirmed_existing",
    update_existing: "operator_confirmed_existing",
    create_new: "operator_confirmed_new",
    reject: "operator_rejected_candidate",
    request_information: "operator_requested_information",
    review_required: "operator_deferred_decision",
    escalate_duplicate: "operator_deferred_decision",
    propose_merge: "operator_deferred_decision",
};

/** The bounded category for one operator decision action. Never the operator's words. */
export function identitySupersessionReasonForDecision(
    decisionAction: string | null | undefined,
): IdentitySupersessionReason {
    if (typeof decisionAction !== "string") return "operator_corrected_identity";
    return REASON_BY_DECISION_ACTION[decisionAction] ?? "operator_corrected_identity";
}

export function isIdentitySupersessionReason(value: string): value is IdentitySupersessionReason {
    return (IDENTITY_SUPERSESSION_REASONS as readonly string[]).includes(value);
}
