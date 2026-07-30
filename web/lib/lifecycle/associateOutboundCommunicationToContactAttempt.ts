/**
 * After an outbound email/SMS is accepted by the platform, satisfy an open Current
 * Work requirement when effective command-result sufficiency maps the objective
 * result to an authored outcome.
 *
 * Precedence (product decision, July 2026):
 * 1. Explicit work-item `sufficient_command_results` wins.
 * 2. Else platform default for recognized canonical templates (contact_family).
 * 3. Else no inference — unknown/custom work never auto-completes from a send.
 *
 * The integrated communication capability publishes what objectively occurred
 * ("sent"); configuration (or the platform default for canonical templates)
 * decides what that result means for the Business Process. Failed sends never
 * satisfy a success-mapped requirement. Operators never see raw runtime result keys.
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
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import {
    COMMUNICATIONS_SEND_CAPABILITY_KEY,
    resolveEffectiveSufficientCommandResultOutcome,
} from "@/lib/lifecycle/stageWorkCompletionPolicy";
import { journeySegmentOrFamily } from "@/lib/lifecycle/grainVocabulary";

/** Capability identity the communications send path publishes results under. */
export const COMMUNICATIONS_SEND_CAPABILITY = COMMUNICATIONS_SEND_CAPABILITY_KEY;

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
    // communication result sufficient (explicit config or platform default for
    // recognized canonical templates).
    for (const task of openTasks) {
        const work = parseOperationalWorkViewFromTaskRow(task);
        const stageKey = work.context_snapshot?.lifecycle_stage_key?.trim() ?? "";
        if (!stageKey) continue;
        const { plan } = resolveEffectiveStageOperatingPlan({
            departmentMetadata: metadata,
            builderStageKey: stageKey,
        });
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
            const outcomeKey = resolveEffectiveSufficientCommandResultOutcome(
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
                    // This caller can only speak for the family — it names no child. `journeySegmentOrFamily`
                    // keeps that tolerance NAMED and greppable instead of a bare `??`; on a
                    // child-grain stage the outcome guard refuses the family subject.
                    journey_segment: journeySegmentOrFamily({ planSegment: plan.journey_segment }),
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
