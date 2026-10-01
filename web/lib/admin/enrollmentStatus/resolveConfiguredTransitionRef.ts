/**
 * Configured transition ref → typed canonical destination.
 *
 * The reverse direction of the existing resolution. `enrollmentStatusTransitionBpResolver` answers
 * "which destinations may this subject reach", keyed by `destinationKey`. Operator surfaces hold the
 * other end: a **configured** reference out of `stage_operating_plan_v1.outgoing_transitions` — the
 * `transition_ref` a tenant authored — and nothing that turns one into a typed destination.
 *
 * ── WHY THIS IS NOT A SECOND RESOLVER ──
 *
 * It composes two functions that already own their invariants: `resolveOutgoingProcessTransitions`
 * decides which transitions the CURRENT stage actually offers, and `mapBuilderStageToDestinationKey`
 * owns the builder-stage → typed-destination mapping. This adds the lookup between them and no
 * lifecycle logic of its own. It resolves; it never mutates.
 *
 * ── WHY A CONFIGURED STRING IS NOT AUTHORITY ──
 *
 * A ref is matched against the transitions the tenant's own configuration offers FROM THE SUBJECT'S
 * CURRENT STAGE. A ref that names a transition out of some other stage does not resolve, so a client
 * cannot reach an arbitrary destination by sending a string that happens to exist elsewhere in the
 * process. Zero matches and ambiguous matches both fail closed, because "execute the first one" is
 * how a configuration defect becomes a wrong lifecycle write.
 */

import {
    mapBuilderStageToDestinationKey,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionBpResolver";
import type { EnrollmentStatusDestinationKey } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import {
    resolveOutgoingProcessTransitions,
    type OutgoingProcessTransition,
} from "@/lib/lifecycle/resolveOutgoingProcessTransitions";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type ConfiguredTransitionRefFailure =
    /** No configured transition out of the current stage carries this ref. */
    | "unknown_ref"
    /** More than one does — the configuration is ambiguous and must not be guessed. */
    | "ambiguous_ref"
    /** The transition exists but its target stage has no typed canonical destination. */
    | "destination_unmapped"
    /** The transition is configured but not currently available to the operator. */
    | "transition_unavailable";

export type ResolveConfiguredTransitionRefResult =
    | {
          ok: true;
          destinationKey: EnrollmentStatusDestinationKey;
          transition: OutgoingProcessTransition;
          /** The outcome key when this transition came from an outcome rule. */
          outcomeKey: string | null;
          /** The canonical resulting status the transition declares, when it declares one. */
          targetStatusKey: string | null;
      }
    | { ok: false; reason: ConfiguredTransitionRefFailure };

export type ResolveConfiguredTransitionRefInput = {
    /** The configured ref the operator surface holds (a `transition_ref`). */
    ref: string;
    /** The subject's CURRENT stage — the scope the ref must resolve within. */
    currentStageKey: string;
    stageOperatingPlan?: StageOperatingPlanV1 | null;
    processTracks?: unknown;
    processStages?: ReadonlyArray<{ key: string; label: string }>;
    /** When false, a configured-but-unavailable transition still resolves (preflight/diagnostics). */
    requireAvailable?: boolean;
};

export function resolveConfiguredTransitionRef(
    input: ResolveConfiguredTransitionRefInput,
): ResolveConfiguredTransitionRefResult {
    const ref = input.ref.trim();
    const currentStageKey = input.currentStageKey.trim();
    if (!ref || !currentStageKey) return { ok: false, reason: "unknown_ref" };

    const offered = resolveOutgoingProcessTransitions({
        currentStageKey,
        stageOperatingPlan: input.stageOperatingPlan ?? null,
        processTracks: input.processTracks ?? null,
        processStages: input.processStages ?? [],
    });

    // A ref may also name the outcome that produced the transition; both are configured identifiers.
    const matches = offered.filter(
        (t) => t.transition_ref.trim() === ref || t.outcome_key?.trim() === ref || t.split_outcome_key?.trim() === ref,
    );
    if (matches.length === 0) return { ok: false, reason: "unknown_ref" };
    if (matches.length > 1) return { ok: false, reason: "ambiguous_ref" };

    const transition = matches[0];
    if ((input.requireAvailable ?? true) && !transition.available) {
        return { ok: false, reason: "transition_unavailable" };
    }

    const destinationKey = mapBuilderStageToDestinationKey(transition.target_stage_key);
    if (!destinationKey) return { ok: false, reason: "destination_unmapped" };

    return {
        ok: true,
        destinationKey,
        transition,
        outcomeKey: transition.outcome_key?.trim() || transition.split_outcome_key?.trim() || null,
        targetStatusKey: transition.status_key?.trim() || null,
    };
}
