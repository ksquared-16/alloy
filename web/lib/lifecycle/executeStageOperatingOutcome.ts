/**
 * Execute stage_operating_plan_v1 outcome rule targets (V1 scoped).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StageOperatingPlanV1, StageOutcomeRuleTargetV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { outcomeRulesForKey } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    applyStageOutcomeRuleTarget,
    type StageOutcomeExecutionSubject,
} from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";

export type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";

export type StageOutcomeExecutionResult = {
    applied_targets: StageOutcomeRuleTargetV1[];
    errors: string[];
    queue_refresh_opportunity_id: string;
    needs_attention_set: boolean;
    status_updated: boolean;
};

export async function executeStageOperatingOutcome(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    departmentId: string;
    plan: StageOperatingPlanV1;
    outcomeKey: string;
    subject: StageOutcomeExecutionSubject;
    attemptCount?: number | null;
}): Promise<StageOutcomeExecutionResult> {
    const rules = outcomeRulesForKey(params.plan, params.outcomeKey, {
        attemptCount: params.attemptCount ?? null,
    });
    const applied_targets: StageOutcomeRuleTargetV1[] = [];
    const errors: string[] = [];
    let needs_attention_set = false;
    let status_updated = false;

    for (const rule of rules) {
        for (const target of rule.targets) {
            const result = await applyStageOutcomeRuleTarget(params.supabase, {
                orgId: params.orgId,
                userId: params.userId,
                departmentId: params.departmentId,
                stageKey: params.plan.stage_key,
                plan: params.plan,
                subject: params.subject,
                target,
            });
            applied_targets.push(target);
            if (result.error) errors.push(result.error);
            if (result.needs_attention) needs_attention_set = true;
            if (result.status_updated) status_updated = true;
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
