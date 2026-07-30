/**
 * After a confirmed tour booking, satisfy open Current Work when effective
 * command-result sufficiency maps `schedule_tour` / `confirmed` to an authored outcome.
 *
 * Precedence matches communications sufficiency:
 * 1. Explicit work-item `sufficient_command_results`
 * 2. Else platform default for recognized templates (contact_family)
 * 3. Else no inference
 *
 * Stage movement stays on outcome rules / domain-signal configuration — never hardcoded here.
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
import { resolveEffectiveSufficientCommandResultOutcome } from "@/lib/lifecycle/stageWorkCompletionPolicy";
import { journeySegmentOrFamily } from "@/lib/lifecycle/grainVocabulary";

export const SCHEDULE_TOUR_CAPABILITY = "schedule_tour";
export const SCHEDULE_TOUR_CONFIRMED_RESULT = "confirmed";

export type AssociateTourBookingToStageWorkInput = {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    opportunityId: string;
    /** Objective result the schedule_tour capability published. Defaults to confirmed. */
    result?: string;
    bookingId?: string | null;
};

export type AssociateTourBookingToStageWorkResult = {
    associated: boolean;
    task_id?: string;
    outcome_key?: string;
    reason?: "no_department" | "no_plan" | "no_open_work" | "no_configured_sufficiency";
    error?: string;
};

export async function associateTourBookingToStageWork(
    input: AssociateTourBookingToStageWorkInput,
): Promise<AssociateTourBookingToStageWorkResult> {
    const opportunityId = input.opportunityId.trim();
    if (!opportunityId) return { associated: false };
    const result = (input.result ?? SCHEDULE_TOUR_CONFIRMED_RESULT).trim();

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

    for (const task of openTasks) {
        const work = parseOperationalWorkViewFromTaskRow(task);
        const stageKey = work.context_snapshot?.lifecycle_stage_key?.trim() ?? "";
        if (!stageKey) continue;
        const { plan } = resolveEffectiveStageOperatingPlan({
            departmentMetadata: metadata,
            builderStageKey: stageKey,
        });
        if (!plan) continue;

        const workDefKey = work.work_definition_key?.trim() ?? "";
        const candidateTemplates = plan.work_templates.slice().sort((a, b) => {
            const aMatch = a.work_definition_key?.trim() === workDefKey ? 0 : 1;
            const bMatch = b.work_definition_key?.trim() === workDefKey ? 0 : 1;
            return aMatch - bMatch;
        });

        for (const template of candidateTemplates) {
            const outcomeKey = resolveEffectiveSufficientCommandResultOutcome(
                template,
                SCHEDULE_TOUR_CAPABILITY,
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
                declaration: {
                    provenance: "integrated",
                    channel: "tour_booking",
                    note: input.bookingId?.trim()
                        ? `schedule_tour confirmed (${input.bookingId.trim()})`
                        : "schedule_tour confirmed",
                },
            });
            if (!completion.ok) {
                return { associated: false, task_id: task.id, error: completion.error };
            }

            return { associated: true, task_id: task.id, outcome_key: outcomeKey };
        }
    }

    return { associated: false, reason: "no_configured_sufficiency" };
}
