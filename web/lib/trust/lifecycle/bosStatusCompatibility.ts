/**
 * BOS status compatibility — PURE, and deliberately not wired to anything.
 *
 * Proves one claim and nothing more: a future `BosProposalEnvelopeV1.status`
 * can be derived from the canonical lifecycle projection, so BOS can stop
 * owning an independently mutable lifecycle (AD-3).
 *
 * **This module is dormant.** No route, surface, adapter, mutation or
 * persistence path imports it, and none may until the Phase 3 cutover. It is
 * not a second lifecycle authority: it holds no state, reads no observation,
 * and cannot be called with anything except a projection that the canonical
 * projector produced.
 *
 * The function takes ONLY a projection. It deliberately does not accept a
 * package, an observation list or a status — if it did, it could disagree with
 * the projection, and a second opinion is exactly what AD-3 forbids.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — AD-3
 */

import type { BosProposalStatus } from "@/lib/bos/bosCapability";
import type {
    DecisionPackageLifecycleProjection,
    LifecycleDisposition,
} from "@/lib/trust/lifecycle/decisionPackageLifecycle";

/**
 * Total mapping from disposition to the existing BOS vocabulary.
 *
 * Exhaustive by construction: a new disposition without an entry fails to
 * compile, so the mapping can never silently fall through to a default.
 *
 * `draft` is deliberately absent from the range. A Decision Package only exists
 * once deterministic validation has already run, so the BOS "created but not yet
 * validated" state is unreachable from a projection. That is a finding about the
 * BOS vocabulary, not a gap in the projection.
 */
const DISPOSITION_TO_BOS_STATUS: Readonly<Record<LifecycleDisposition, BosProposalStatus>> = {
    // A refusal package carries no recommendation to act on.
    not_actionable: "failed",
    execution_failed: "failed",
    executed: "applied",
    superseded: "superseded",
    expired: "expired",
    rejected: "rejected",
    accepted: "approved",
    // Deferred and presented both mean "validated, awaiting a human".
    deferred: "validated",
    presented: "validated",
    proposed: "validated",
};

/** BOS statuses this adapter can never produce, with the reason. */
export const UNREACHABLE_BOS_STATUSES: Readonly<Record<string, string>> = {
    draft: "A Decision Package exists only after deterministic validation has passed, so it is never a pre-validation draft.",
};

/**
 * Derives the BOS presentation status from canonical Trust state.
 *
 * Pure and total. The projection is the only input, so this can never become a
 * competing source of truth.
 */
export function bosStatusFromLifecycleProjection(
    projection: DecisionPackageLifecycleProjection,
): BosProposalStatus {
    return DISPOSITION_TO_BOS_STATUS[projection.disposition];
}

/**
 * The presentation slice of a future envelope, derived rather than stored.
 *
 * Returns exactly the fields BOS needs to render a proposal's standing. Nothing
 * here is persisted, and nothing here is writable.
 */
export type DerivedBosProposalPresentation = {
    readonly status: BosProposalStatus;
    /** Whether an operator can still act. Derived, never a stored flag. */
    readonly actionable: boolean;
    /** One sentence explaining the status, straight from the projection. */
    readonly reason: string;
    readonly as_of_iso: string;
};

export function deriveBosProposalPresentation(
    projection: DecisionPackageLifecycleProjection,
): DerivedBosProposalPresentation {
    return {
        status: bosStatusFromLifecycleProjection(projection),
        actionable: projection.operator_action_available,
        reason: projection.reason,
        as_of_iso: projection.projected_at_iso,
    };
}
