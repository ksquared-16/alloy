/**
 * Plan-then-mutate for configured stage outcomes (Law 6).
 *
 * THE DEFECT THIS EXISTS TO END
 *
 * `applyConfiguredStageAutomationRules` called `applyStageOutcomeRuleTarget` directly, without ever
 * expanding a `move_to_stage` through its transition. The modern editor writes movement as
 * `{ kind: "move_to_stage", transition_ref: "lead_to_tour" }` — no `stage_key` — so the executor
 * looked for a stage key, found none, and returned "Missing target stage key". Meanwhile the status
 * target in the same rule had already committed. Status moved, stage did not, and durable state
 * contradicted itself. That is the Firefly failure, exactly.
 *
 * It also discarded `result.undo`, so there was nothing to roll back with.
 *
 * WHAT THIS CHANGES
 *
 * Every reference is resolved BEFORE the first durable write. If any of them fails to resolve, the
 * caller returns having written nothing — a configuration error can no longer produce a partial
 * mutation. `resolveStageTransitionExecutionTargets` is pure, so the whole plan is knowable up
 * front; the previous code simply asked at the wrong time.
 *
 * This is the plan phase Law 6 requires: "every effect's references resolve during a plan phase
 * that performs zero writes".
 */

import { resolveStageTransitionExecutionTargets } from "@/lib/lifecycle/resolveStageTransitionExecutionTargets";
import type {
    StageOperatingPlanV1,
    StageOutcomeRuleTargetKind,
    StageOutcomeRuleTargetV1,
    StageOutcomeRuleV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

/** One resolved, executable unit of work. Nothing here still needs looking up. */
export type StageExecutionStep = {
    stage_key: string;
    rule_key: string;
    plan: StageOperatingPlanV1;
    /** The configured target, for reporting. */
    source_target: StageOutcomeRuleTargetV1;
    /** The primitive to execute — a transition has already been expanded into its parts. */
    executable: StageOutcomeRuleTargetV1;
};

export type StageExecutionPlan = {
    steps: StageExecutionStep[];
    /** Unresolved references. **Non-empty means execute nothing.** */
    errors: string[];
    /** Rules that contributed at least one step. */
    planned_rule_keys: string[];
    /** Rules with at least one unresolvable reference. */
    unresolvable_rule_keys: string[];
};

export type StageOutcomeRuleMatch = {
    stageKey: string;
    plan: StageOperatingPlanV1;
    rule: StageOutcomeRuleV1;
};

/**
 * Resolve every configured effect of every matched rule. **Performs zero writes.**
 *
 * A `move_to_stage` is expanded through its transition here, which is what turns
 * `transition_ref: "lead_to_tour"` into an executable stage move plus any status change the
 * transition carries.
 */
export function planStageOutcomeExecution(
    matched: readonly StageOutcomeRuleMatch[],
    opts?: { skipTargetKinds?: readonly StageOutcomeRuleTargetKind[] },
): StageExecutionPlan {
    const steps: StageExecutionStep[] = [];
    const errors: string[] = [];
    const planned = new Set<string>();
    const unresolvable = new Set<string>();

    for (const { stageKey, plan, rule } of matched) {
        for (const target of rule.targets) {
            if (opts?.skipTargetKinds?.includes(target.kind)) continue;

            const resolved = resolveStageTransitionExecutionTargets(plan, target);
            if (resolved.error) {
                // Name the rule. "Transition X is not configured on this stage" without saying
                // which rule asked for it is not actionable.
                errors.push(`${stageKey}/${rule.rule_key}: ${resolved.error}`);
                unresolvable.add(rule.rule_key);
                continue;
            }
            for (const executable of resolved.targets) {
                steps.push({ stage_key: stageKey, rule_key: rule.rule_key, plan, source_target: target, executable });
            }
            planned.add(rule.rule_key);
        }
    }

    return {
        steps,
        errors,
        planned_rule_keys: [...planned],
        unresolvable_rule_keys: [...unresolvable],
    };
}
