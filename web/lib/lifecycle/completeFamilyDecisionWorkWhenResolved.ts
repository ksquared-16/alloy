/**
 * THE FAMILY'S DECISION WORK COMPLETES ITSELF WHEN THE LAST CHILD HAS A PATH.
 *
 * Choosing each child's path is the decision; asking the operator to then pick "Child paths chosen"
 * was a second, redundant question. Once every child on the family has a path, the runtime records
 * the template's runtime-owned completion outcome (`runtimeCompletionOutcomeKey` — configuration's,
 * never named here) on the family's own open work item, through the canonical outcome runtime.
 *
 * Additive and idempotent: nothing to complete, no runtime-owned outcome, or a failure leaves the
 * work open for the operator, and a repeat joins the first completion by its idempotency key.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { completeStageWorkWithOutcome } from "@/lib/lifecycle/completeStageWorkWithOutcome";
import { runtimeCompletionOutcomeKey } from "@/lib/lifecycle/participantDecisionCompletion";
import { taskMatchesStageWorkTemplate } from "@/lib/lifecycle/projectStageWorkRuntime";
import { childOfStageWork } from "@/lib/lifecycle/stageWorkChildSubject";
import type { StageOperatingPlanV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type FamilyDecisionCompletion =
    | { completed: true; work_id: string; outcome_key: string }
    | { completed: false; reason: "not_all_resolved" | "no_runtime_outcome" | "no_open_work" | "failed"; message?: string };

export async function completeFamilyDecisionWorkWhenResolved(input: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    departmentId: string;
    opportunityId: string;
    stageKey: string;
    plan: StageOperatingPlanV1;
    template: StageWorkTemplateV1;
    allResolved: boolean;
    correlationId?: string | null;
}): Promise<FamilyDecisionCompletion> {
    if (!input.allResolved) return { completed: false, reason: "not_all_resolved" };
    const outcomeKey = runtimeCompletionOutcomeKey(input.plan, input.template);
    if (!outcomeKey) return { completed: false, reason: "no_runtime_outcome" };

    const { data, error } = await input.supabase
        .from("operational_tasks")
        .select("id, title, due_at, status, source, metadata, updated_at")
        .eq("org_id", input.orgId)
        .eq("entity_type", "opportunities")
        .eq("entity_id", input.opportunityId)
        .eq("status", "open");
    if (error) return { completed: false, reason: "failed", message: error.message };
    const keys = new Set(input.plan.work_templates.map((t) => t.template_key));
    // The FAMILY's item: this template's work, owned by no child.
    const work = ((data ?? []) as Parameters<typeof taskMatchesStageWorkTemplate>[0][]).find(
        (row) => taskMatchesStageWorkTemplate(row, input.stageKey, input.template, keys) && childOfStageWork(row.metadata) === null,
    );
    if (!work) return { completed: false, reason: "no_open_work" };

    const result = await completeStageWorkWithOutcome({
        supabase: input.supabase,
        orgId: input.orgId,
        userId: input.userId,
        departmentId: input.departmentId,
        stageKey: input.stageKey,
        workId: String(work.id),
        outcomeKey,
        subject: { journey_segment: "family", opportunity_id: input.opportunityId },
        correlationId: input.correlationId ?? null,
        idempotencyKey: `${input.orgId}:${work.id}:${outcomeKey}:all_children_have_a_path`,
    });
    if (!result.ok) return { completed: false, reason: "failed", message: result.error };
    return { completed: true, work_id: String(work.id), outcome_key: outcomeKey };
}
