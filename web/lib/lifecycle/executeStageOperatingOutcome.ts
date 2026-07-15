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
    applied_targets: StageOutcomeRuleTargetV1[];
    errors: string[];
    queue_refresh_opportunity_id: string;
    needs_attention_set: boolean;
    status_updated: boolean;
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
    const errors: string[] = [];
    let needs_attention_set = false;
    let status_updated = false;

    for (const rule of rules) {
        for (const target of rule.targets) {
            if (skipKinds?.includes(target.kind)) continue;
            applied_targets.push(target);
            const resolved = resolveStageTransitionExecutionTargets(params.plan, target);
            if (resolved.error) {
                errors.push(resolved.error);
                continue;
            }
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
                if (result.error) errors.push(result.error);
                if (result.needs_attention) needs_attention_set = true;
                if (result.status_updated) status_updated = true;
            }
        }
    }

    return {
        applied_targets,
        errors,
        queue_refresh_opportunity_id: params.subject.opportunity_id,
        needs_attention_set,
        status_updated,
    };
}
