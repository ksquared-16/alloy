/**
 * Execute stage_operating_plan_v1 outcome rule targets (V1 scoped).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StageOperatingPlanV1, StageOutcomeRuleTargetKind, StageOutcomeRuleTargetV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { outcomeRulesForKey } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    applyStageOutcomeRuleTarget,
    type StageOutcomeExecutionSubject,
} from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";
import { resolveStageTransitionExecutionTargets } from "@/lib/lifecycle/resolveStageTransitionExecutionTargets";

export type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";

export type StageOutcomeExecutionResult = {
    /**
     * Targets that ACTUALLY succeeded. Previously every target was pushed here before it ran,
     * so a failed rule target was reported to the operator as applied.
     */
    applied_targets: StageOutcomeRuleTargetV1[];
    /** Targets that were attempted and failed. */
    failed_targets: StageOutcomeRuleTargetV1[];
    errors: string[];
    /** Declared out-of-boundary effects that did not run. Surfaced, never swallowed. */
    degraded: string[];
    queue_refresh_opportunity_id: string;
    needs_attention_set: boolean;
    status_updated: boolean;
    /**
     * Inverses of the targets that succeeded, in application order. The Platform Transaction
     * Contract applies them in reverse when the surrounding transaction aborts.
     */
    undo: Array<{ target: StageOutcomeRuleTargetV1; run: () => Promise<void> }>;
};

/** Status/movement targets skipped when the caller already applied the transition manually. */
export const STAGE_OUTCOME_MANUAL_TRANSITION_SKIP_TARGET_KINDS: readonly StageOutcomeRuleTargetKind[] = [
    "update_family_case_status",
    "update_child_enrollment_status",
    "update_candidate_status",
    "move_to_stage",
    "no_movement",
];

export async function executeStageOperatingOutcome(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    departmentId: string;
    plan: StageOperatingPlanV1;
    outcomeKey: string;
    subject: StageOutcomeExecutionSubject;
    attemptCount?: number | null;
    skipTargetKinds?: readonly StageOutcomeRuleTargetKind[];
}): Promise<StageOutcomeExecutionResult> {
    const rules = outcomeRulesForKey(params.plan, params.outcomeKey, {
        attemptCount: params.attemptCount ?? null,
    });
    const skipKinds = params.skipTargetKinds ?? null;
    const applied_targets: StageOutcomeRuleTargetV1[] = [];
    const failed_targets: StageOutcomeRuleTargetV1[] = [];
    const errors: string[] = [];
    const degraded: string[] = [];
    const undo: Array<{ target: StageOutcomeRuleTargetV1; run: () => Promise<void> }> = [];
    let needs_attention_set = false;
    let status_updated = false;

    for (const rule of rules) {
        for (const target of rule.targets) {
            if (skipKinds?.includes(target.kind)) continue;
            const resolved = resolveStageTransitionExecutionTargets(params.plan, target);
            if (resolved.error) {
                errors.push(resolved.error);
                failed_targets.push(target);
                continue;
            }
            let targetFailed = false;
            for (const executableTarget of resolved.targets) {
                const result = await applyStageOutcomeRuleTarget(params.supabase, {
                    orgId: params.orgId,
                    userId: params.userId,
                    departmentId: params.departmentId,
                    stageKey: params.plan.stage_key,
                    plan: params.plan,
                    subject: params.subject,
                    target: executableTarget,
                });
                if (result.error) {
                    errors.push(result.error);
                    targetFailed = true;
                }
                if (result.degraded) degraded.push(result.degraded);
                if (result.undo) undo.push({ target: executableTarget, run: result.undo });
                if (result.needs_attention) needs_attention_set = true;
                if (result.status_updated) status_updated = true;
            }
            // A target is "applied" only once it has actually been applied.
            if (targetFailed) failed_targets.push(target);
            else applied_targets.push(target);
        }
    }

    return {
        applied_targets,
        failed_targets,
        errors,
        degraded,
        queue_refresh_opportunity_id: params.subject.opportunity_id,
        needs_attention_set,
        status_updated,
        undo,
    };
}

/**
 * Undo the targets that succeeded, in reverse application order. Returns the errors from any
 * inverse that could not be applied — the caller must NOT report a clean rollback when this
 * is non-empty.
 */
export async function rollbackStageOperatingOutcome(
    execution: Pick<StageOutcomeExecutionResult, "undo">,
): Promise<string[]> {
    const failures: string[] = [];
    for (let index = execution.undo.length - 1; index >= 0; index -= 1) {
        const entry = execution.undo[index];
        try {
            await entry.run();
        } catch (error) {
            failures.push(`${entry.target.kind}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return failures;
}
