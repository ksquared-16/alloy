/**
 * After an outbound email/SMS is accepted by the platform, satisfy an open Current
 * Work requirement IF — and only if — configuration declares the objective
 * communication result sufficient (completion_policy.sufficient_command_results).
 *
 * The integrated communication capability publishes what objectively occurred
 * ("sent"); configuration decides what that result means for the Business Process.
 * There is no hardcoded outcome and no hardcoded stage/definition list: an
 * unconfigured successful send never completes Current Work.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listWorkForEntity } from "@/lib/admin/operationalWork/operationalWorkService";
import { parseOperationalWorkViewFromTaskRow } from "@/lib/admin/operationalWork/operationalWorkMetadata";
import { completeStageWorkWithOutcome } from "@/lib/lifecycle/completeStageWorkWithOutcome";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import {
    lifecycleBuilderFromDepartmentMetadata,
    activeLifecycleProcess,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveStageOperatingPlanForStage } from "@/lib/lifecycle/stageOperatingPlanV1";
import { resolveSufficientCommandResultOutcome } from "@/lib/lifecycle/stageWorkCompletionPolicy";

/** Capability identity the communications send path publishes results under. */
export const COMMUNICATIONS_SEND_CAPABILITY = "communications_send";

export type AssociateCommunicationToContactAttemptInput = {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    opportunityId: string;
    channel: "email" | "sms";
    /** Objective result the capability published. Defaults to "sent" on accepted enqueue. */
    result?: string;
    communicationMessageId?: string | null;
};

export type AssociateCommunicationToContactAttemptResult = {
    associated: boolean;
    task_id?: string;
    outcome_key?: string;
    /** Present when a matching open work item existed but no configured result mapping applied. */
    reason?: "no_department" | "no_plan" | "no_open_work" | "no_configured_sufficiency";
    error?: string;
};

export async function associateOutboundCommunicationToContactAttempt(
    input: AssociateCommunicationToContactAttemptInput,
): Promise<AssociateCommunicationToContactAttemptResult> {
    const opportunityId = input.opportunityId.trim();
    if (!opportunityId) return { associated: false };
    const result = (input.result ?? "sent").trim();

    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase: input.supabase,
        orgId: input.orgId,
        opportunityId,
    });
    if (!departmentId) return { associated: false, reason: "no_department" };

    const { data: dept } = await input.supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    const metadata =
        dept?.metadata != null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    if (!process) return { associated: false, reason: "no_plan" };

    const listed = await listWorkForEntity({
        supabase: input.supabase,
        orgId: input.orgId,
        entityType: "opportunities",
        entityId: opportunityId,
    });
    if (!listed.ok) return { associated: false, error: listed.message };

    const openTasks = listed.rows.filter((row) => row.status === "open");
    if (!openTasks.length) return { associated: false, reason: "no_open_work" };

    // Find the first open work item whose stage template declares this objective
    // communication result sufficient. This replaces the hardcoded stage/def sets +
    // the hardcoded `sent_text` outcome with configuration.
    for (const task of openTasks) {
        const work = parseOperationalWorkViewFromTaskRow(task);
        const stageKey = work.context_snapshot?.lifecycle_stage_key?.trim() ?? "";
        if (!stageKey) continue;
        const stageRecord =
            process.stages.find((s) => s.key === stageKey && s.is_active) ?? null;
        const plan = resolveStageOperatingPlanForStage(stageRecord ?? {}, stageKey);
        if (!plan) continue;

        // Prefer the task's own template; otherwise any template at this stage whose
        // policy maps this capability result.
        const workDefKey = work.work_definition_key?.trim() ?? "";
        const candidateTemplates = plan.work_templates.slice().sort((a, b) => {
            const aMatch = a.work_definition_key?.trim() === workDefKey ? 0 : 1;
            const bMatch = b.work_definition_key?.trim() === workDefKey ? 0 : 1;
            return aMatch - bMatch;
        });

        for (const template of candidateTemplates) {
            const outcomeKey = resolveSufficientCommandResultOutcome(
                template,
                COMMUNICATIONS_SEND_CAPABILITY,
                result,
            );
            if (!outcomeKey) continue;

            const completion = await completeStageWorkWithOutcome({
                supabase: input.supabase,
                orgId: input.orgId,
                userId: input.userId,
                departmentId,
                stageKey,
                workId: task.id,
                outcomeKey,
                subject: {
                    journey_segment: plan.journey_segment ?? "family",
                    opportunity_id: opportunityId,
                },
                declaration: { provenance: "integrated", channel: input.channel },
            });
            if (!completion.ok) {
                return { associated: false, task_id: task.id, error: completion.error };
            }

            if (input.communicationMessageId?.trim()) {
                const md = { ...(task.metadata ?? {}) };
                const links = Array.isArray(md.associated_communication_message_ids)
                    ? [...(md.associated_communication_message_ids as string[])]
                    : [];
                if (!links.includes(input.communicationMessageId)) {
                    links.push(input.communicationMessageId);
                }
                md.associated_communication_message_ids = links;
                await input.supabase
                    .from("operational_tasks")
                    .update({ metadata: md })
                    .eq("org_id", input.orgId)
                    .eq("id", task.id);
            }

            return { associated: true, task_id: task.id, outcome_key: outcomeKey };
        }
    }

    return { associated: false, reason: "no_configured_sufficiency" };
}
