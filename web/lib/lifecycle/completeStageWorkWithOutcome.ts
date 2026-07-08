/**
 * Complete lifecycle stage work with a configured outcome — V1 orchestration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { completeWorkInstance } from "@/lib/admin/operationalWork/operationalWorkService";
import {
    lifecycleBuilderFromDepartmentMetadata,
    activeLifecycleProcess,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { executeStageOperatingOutcome, type StageOutcomeExecutionSubject } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { patchLifecycleWorkIntentAttemptMetadata } from "@/lib/lifecycle/patchLifecycleWorkIntentAttemptMetadata";
import { resolveStageOperatingPlanForStage } from "@/lib/lifecycle/stageOperatingPlanV1";
import { shouldCloseWorkAfterStageOutcome } from "@/lib/lifecycle/shouldCloseWorkAfterStageOutcome";
import { shouldRepeatWorkAfterRetryOutcome } from "@/lib/lifecycle/stageWorkCompletionPolicy";
import { reopenStageWorkWithDueDate } from "@/lib/lifecycle/reopenStageWorkWithDueDate";
import { recordStageWorkContactOutcomeTrace } from "@/lib/lifecycle/recordStageWorkContactOutcomeTrace";

export type CompleteStageWorkWithOutcomeInput = {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    departmentId: string;
    stageKey: string;
    workId: string;
    outcomeKey: string;
    subject: StageOutcomeExecutionSubject;
};

export type CompleteStageWorkWithOutcomeResult = {
    ok: boolean;
    error?: string;
    work_closed?: boolean;
    attempt_count?: number;
    outcome_execution?: Awaited<ReturnType<typeof executeStageOperatingOutcome>>;
};

export async function completeStageWorkWithOutcome(
    input: CompleteStageWorkWithOutcomeInput,
): Promise<CompleteStageWorkWithOutcomeResult> {
    const stageKey = input.stageKey.trim();
    const outcomeKey = input.outcomeKey.trim();
    if (!stageKey || !outcomeKey) {
        return { ok: false, error: "stageKey and outcomeKey are required" };
    }

    const { data: dept, error: deptErr } = await input.supabase
        .from("departments")
        .select("metadata")
        .eq("id", input.departmentId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    if (deptErr) return { ok: false, error: deptErr.message };
    if (!dept) return { ok: false, error: "Department not found" };

    const metadata =
        dept.metadata != null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const stageRecord = process?.stages.find((s) => s.key === stageKey && s.is_active) ?? null;
    const plan = resolveStageOperatingPlanForStage(stageRecord ?? {}, stageKey);
    if (!plan) return { ok: false, error: "No operating plan for stage" };

    const outcome = plan.outcomes.find((o) => o.outcome_key === outcomeKey);
    if (!outcome) return { ok: false, error: "Unknown outcome for stage" };

    const closeDecision = shouldCloseWorkAfterStageOutcome(plan, outcomeKey);
    let attempt_count: number | undefined;

    if (closeDecision.shouldClose) {
        const completed = await completeWorkInstance({
            supabase: input.supabase,
            orgId: input.orgId,
            workId: input.workId,
        });
        if (!completed.ok) {
            return { ok: false, error: completed.message ?? completed.error };
        }
    } else {
        const patched = await patchLifecycleWorkIntentAttemptMetadata({
            supabase: input.supabase,
            orgId: input.orgId,
            workId: input.workId,
            outcomeKey,
            outcomeLabel: outcome.label,
        });
        if (!patched.ok) {
            return { ok: false, error: patched.error };
        }
        attempt_count = patched.attempt_count;
    }

    const outcome_execution = await executeStageOperatingOutcome({
        supabase: input.supabase,
        orgId: input.orgId,
        userId: input.userId,
        departmentId: input.departmentId,
        plan,
        outcomeKey,
        subject: { ...input.subject, work_id: input.workId },
        attemptCount: attempt_count ?? null,
    });

    if (outcome_execution.errors.length) {
        return {
            ok: false,
            error: outcome_execution.errors.join("; "),
            work_closed: closeDecision.shouldClose,
            attempt_count,
            outcome_execution,
        };
    }

    const workTemplateKey = outcome.work_template_key?.trim() ?? plan.work_templates[0]?.template_key ?? "";
    if (workTemplateKey) {
        await recordStageWorkContactOutcomeTrace({
            supabase: input.supabase,
            orgId: input.orgId,
            userId: input.userId,
            opportunityId: input.subject.opportunity_id,
            stageKey,
            workId: input.workId,
            workTemplateKey,
            outcomeKey,
            outcomeLabel: outcome.label,
            plan,
            departmentMetadata: metadata,
        });
    }

    if (!closeDecision.shouldClose && attempt_count != null) {
        const workTemplateKey = outcome.work_template_key?.trim() ?? null;
        const workTemplate =
            workTemplateKey ?
                plan.work_templates.find((t) => t.template_key === workTemplateKey) ?? null
            :   plan.work_templates[0] ?? null;
        const repeat = shouldRepeatWorkAfterRetryOutcome(workTemplate, attempt_count);
        if (repeat.repeat && repeat.dueDays != null) {
            const reopened = await reopenStageWorkWithDueDate({
                supabase: input.supabase,
                orgId: input.orgId,
                workId: input.workId,
                dueDays: repeat.dueDays,
            });
            if (!reopened.ok) {
                return { ok: false, error: reopened.error, work_closed: false, attempt_count };
            }
        }
    }

    return {
        ok: true,
        work_closed: closeDecision.shouldClose,
        attempt_count,
        outcome_execution,
    };
}
