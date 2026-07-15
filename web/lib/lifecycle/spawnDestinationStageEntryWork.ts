/**
 * After a process transition lands a subject in a new stage, spawn configured
 * stage-entry work from the destination stage operating plan.
 *
 * Ownership: transition changes durable stage membership first; entry work is
 * created for the destination stage (not a second spawn engine).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { instantiateStageWorkFromTemplate } from "@/lib/lifecycle/instantiateStageWorkFromTemplate";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { resolveEffectivePrimaryWorkTemplate } from "@/lib/lifecycle/stageOperatingPlanConvergence";
import type { StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type SpawnDestinationStageEntryWorkResult = {
    action: "spawned" | "deduped" | "skipped";
    work_id?: string;
    reason?: string;
    stage_key?: string;
    template_key?: string;
};

function isTerminalOrWorkless(templates: StageWorkTemplateV1[]): boolean {
    return templates.length === 0;
}

/**
 * Resolve destination-stage entry templates. Prefer the primary template; if none,
 * spawn the first required template. Does not invent process-specific keys.
 */
export function resolveDestinationStageEntryTemplates(params: {
    departmentMetadata: Record<string, unknown>;
    destinationStageKey: string;
}): { stageKey: string; templates: StageWorkTemplateV1[]; reason?: string } {
    const stageKey = params.destinationStageKey.trim();
    if (!stageKey) {
        return { stageKey, templates: [], reason: "missing_destination_stage" };
    }

    const { plan } = resolveEffectiveStageOperatingPlan({
        departmentMetadata: params.departmentMetadata,
        builderStageKey: stageKey,
    });

    if (!plan) {
        return { stageKey, templates: [], reason: "no_destination_plan" };
    }

    if (isTerminalOrWorkless(plan.work_templates)) {
        return { stageKey, templates: [], reason: "terminal_or_workless_stage" };
    }

    const primary = resolveEffectivePrimaryWorkTemplate(plan);
    if (primary) {
        return { stageKey, templates: [primary] };
    }

    const required = plan.work_templates.find((row) => row.required);
    if (required) {
        return { stageKey, templates: [required] };
    }

    return { stageKey, templates: [], reason: "no_entry_work_template" };
}

export async function spawnDestinationStageEntryWork(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    opportunityId: string;
    departmentId: string;
    destinationStageKey: string;
    departmentMetadata: Record<string, unknown>;
    now?: Date;
}): Promise<SpawnDestinationStageEntryWorkResult> {
    const resolved = resolveDestinationStageEntryTemplates({
        departmentMetadata: params.departmentMetadata,
        destinationStageKey: params.destinationStageKey,
    });

    if (!resolved.templates.length) {
        return {
            action: "skipped",
            reason: resolved.reason ?? "no_entry_work_template",
            stage_key: resolved.stageKey,
        };
    }

    const template = resolved.templates[0]!;
    const now = params.now ?? new Date();
    const result = await instantiateStageWorkFromTemplate({
        supabase: params.supabase,
        orgId: params.orgId,
        userId: params.userId,
        opportunityId: params.opportunityId,
        stageKey: resolved.stageKey,
        departmentId: params.departmentId,
        template,
        departmentMetadata: params.departmentMetadata,
        now,
    });

    if (result.status === "created") {
        return {
            action: "spawned",
            work_id: result.work_id,
            stage_key: resolved.stageKey,
            template_key: template.template_key,
        };
    }
    if (result.status === "deduped") {
        return {
            action: "deduped",
            work_id: result.work_id,
            reason: result.reason,
            stage_key: resolved.stageKey,
            template_key: template.template_key,
        };
    }
    return {
        action: "skipped",
        reason: result.error,
        stage_key: resolved.stageKey,
        template_key: template.template_key,
    };
}
