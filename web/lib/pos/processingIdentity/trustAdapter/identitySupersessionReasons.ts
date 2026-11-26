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
    /** The operator agreed with the engine's judgment. NOT a supersession. */
    "operator_confirmed_engine_judgment",
    /** The engine declined to decide; an operator supplied the answer. NOT a supersession. */
    "operator_resolved_engine_review",
    /** The operator postponed the decision. NOT a supersession. */
    "operator_deferred_decision",
    /** The operator chose a DIFFERENT existing record than the engine asserted. */
    "operator_selected_other_candidate",
    /** The operator created new against an engine assertion to link. */
    "operator_overrode_with_create_new",
    /** The operator rejected a candidate set the engine had asserted a result for. */
    "operator_rejected_candidate",
    /** The operator changed the authoritative result in a way not otherwise categorised. */
    "operator_corrected_identity",
    /** A replacement deterministic generation produced a newer governed judgment. */
    "replacement_engine_generation",
] as const;

export type IdentitySupersessionReason = (typeof IDENTITY_SUPERSESSION_REASONS)[number];

/**
 * Effect → bounded category.
 *
 * Keyed on the classified EFFECT, not on `decision_action`. Phase 1.6 keyed on
 * the action, which is why `link_existing` mapped to
 * `operator_confirmed_existing` and then superseded the package it had just
 * confirmed — the vocabulary said "confirmed" while the lifecycle said
 * "replaced". Keying on the effect makes those agree by construction.
 */
const REASON_BY_EFFECT: Readonly<Record<string, IdentitySupersessionReason>> = {
    confirmation: "operator_confirmed_engine_judgment",
    engine_deferred_review: "operator_resolved_engine_review",
    operator_deferred: "operator_deferred_decision",
    override_existing_candidate: "operator_selected_other_candidate",
    override_create_new: "operator_overrode_with_create_new",
    rejection: "operator_rejected_candidate",
    replacement_generation: "replacement_engine_generation",
};

/** The bounded category for one classified effect. Never the operator's words. */
export function identitySupersessionReasonForEffect(
    effect: string | null | undefined,
): IdentitySupersessionReason {
    if (typeof effect !== "string") return "operator_corrected_identity";
    return REASON_BY_EFFECT[effect] ?? "operator_corrected_identity";
}

export function isIdentitySupersessionReason(value: string): value is IdentitySupersessionReason {
    return (IDENTITY_SUPERSESSION_REASONS as readonly string[]).includes(value);
}

/**
 * The inverse, for replaying a frozen gap snapshot.
 *
 * A gap records the bounded REASON, not the effect. Reconciliation needs the
 * effect back to re-append an identical review observation, and the mapping is
 * one-to-one for every reason a review can produce. A reason that only a
 * supersession produces degrades to `operator_corrected_identity`, which the
 * review path never sees.
 */
const EFFECT_BY_REASON: Readonly<Record<string, string>> = Object.fromEntries(
    Object.entries(REASON_BY_EFFECT).map(([effect, reason]) => [reason, effect]),
);

export function effectForSupersessionReason(reason: string | null | undefined): string {
    if (typeof reason !== "string") return "operator_corrected_identity";
    return EFFECT_BY_REASON[reason] ?? "operator_corrected_identity";
}
