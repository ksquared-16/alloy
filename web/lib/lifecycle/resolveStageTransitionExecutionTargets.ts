import type {
    StageOperatingPlanV1,
    StageOutcomeRuleTargetV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

/**
 * Resolve a transition identity to executable legacy primitives. Explicit
 * stage-owned transitions are authoritative; old stage_key targets remain
 * executable only when the plan has no first-class transition collection.
 */
export function resolveStageTransitionExecutionTargets(
    plan: StageOperatingPlanV1,
    target: StageOutcomeRuleTargetV1,
): { targets: StageOutcomeRuleTargetV1[]; error?: string } {
    if (target.kind !== "move_to_stage") return { targets: [target] };

    if (plan.outgoing_transitions === undefined) {
        return target.stage_key?.trim()
            ? { targets: [target] }
            : { targets: [], error: "Legacy move target is missing stage_key." };
    }

    const ref = target.transition_ref?.trim();
    if (!ref) return { targets: [], error: "Transition execution requires transition_ref." };
    const transition = plan.outgoing_transitions.find((row) => row.transition_ref === ref);
    if (!transition) return { targets: [], error: `Transition "${ref}" is not configured on this stage.` };
    if (!transition.available) return { targets: [], error: `Transition "${ref}" is unavailable.` };

    const targets: StageOutcomeRuleTargetV1[] = [];
    if (transition.status_key) {
        targets.push(
            plan.journey_segment === "child"
                ? { kind: "update_child_enrollment_status", disposition_key: transition.status_key }
                : { kind: "update_family_case_status", status_key: transition.status_key },
        );
    }
    targets.push({
        kind: "move_to_stage",
        stage_key: transition.target_stage_key,
        transition_ref: transition.transition_ref,
    });
    return { targets };
}
