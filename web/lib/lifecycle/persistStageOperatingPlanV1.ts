/**
 * Persist stage_operating_plan_v1 on lifecycle builder stage save.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { legacyEnrollmentOperatingPlanDefault } from "@/lib/businessProcessTemplates/enrollmentLegacyCompat";
import {
    STAGE_OPERATING_PLAN_METADATA_KEY,
    parseStageOperatingPlanV1,
    type StageOperatingPlanV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

export type StageOperatingPlanPersistenceResult = {
    metadata: Record<string, unknown>;
    plan: StageOperatingPlanV1 | null;
    builderStageUpdated: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function findProcessStageRaw(
    metadata: Record<string, unknown>,
    stageKey: string,
): { stageRaw: Record<string, unknown>; processKey: string } | null {
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    if (!process) return null;
    const stage = process.stages.find((s) => s.key === stageKey.trim() && s.is_active);
    if (!stage) return null;
    return { stageRaw: stage as unknown as Record<string, unknown>, processKey: process.key };
}

function applyPlanToBuilderStage(
    metadata: Record<string, unknown>,
    stageKey: string,
    plan: StageOperatingPlanV1,
): Record<string, unknown> {
    const out = structuredClone(metadata) as Record<string, unknown>;
    const builderRaw = out[LIFECYCLE_BUILDER_METADATA_KEY];
    if (!isRecord(builderRaw) || !Array.isArray(builderRaw.processes)) return out;

    for (let pi = 0; pi < builderRaw.processes.length; pi++) {
        const processRaw = builderRaw.processes[pi];
        if (!isRecord(processRaw) || String(processRaw.key ?? "").trim() !== ENROLLMENT_PROCESS_KEY) continue;
        if (!Array.isArray(processRaw.stages)) continue;

        for (let si = 0; si < processRaw.stages.length; si++) {
            const stageRaw = processRaw.stages[si];
            if (!isRecord(stageRaw) || String(stageRaw.key ?? "").trim() !== stageKey.trim()) continue;
            stageRaw[STAGE_OPERATING_PLAN_METADATA_KEY] = structuredClone(plan);
            processRaw.stages[si] = stageRaw;
            builderRaw.processes[pi] = processRaw;
            out[LIFECYCLE_BUILDER_METADATA_KEY] = builderRaw;
            return out;
        }
    }

    return out;
}

/** Exported for tests — preserve existing tenant plans; seed only when absent. */
export function operatingPlanSeedDecision(
    stageKey: string,
    container: unknown,
    processKey: string,
): { action: "seed" | "preserve" | "none"; plan: StageOperatingPlanV1 | null } {
    if (isRecord(container)) {
        const raw = container[STAGE_OPERATING_PLAN_METADATA_KEY];
        if (raw !== undefined) {
            const parsed = parseStageOperatingPlanV1(raw);
            if (parsed) return { action: "preserve", plan: parsed };
            return { action: "none", plan: null };
        }
    }
    if (processKey.trim() === ENROLLMENT_PROCESS_KEY) {
        const defaultPlan = legacyEnrollmentOperatingPlanDefault(stageKey);
        if (defaultPlan) return { action: "seed", plan: defaultPlan };
    }
    return { action: "none", plan: null };
}

export async function persistStageOperatingPlanForLifecycleStageSave(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        stageKey: string;
        metadata: Record<string, unknown>;
        explicitPlan?: StageOperatingPlanV1 | null;
    },
): Promise<StageOperatingPlanPersistenceResult> {
    const stageKey = params.stageKey.trim();
    let metadata = params.metadata;
    let builderStageUpdated = false;
    let plan: StageOperatingPlanV1 | null = null;

    if (params.explicitPlan) {
        plan = params.explicitPlan;
        metadata = applyPlanToBuilderStage(metadata, stageKey, plan);
        builderStageUpdated = true;
    } else {
        const stageCtx = findProcessStageRaw(params.metadata, stageKey);
        const decision = operatingPlanSeedDecision(
            stageKey,
            stageCtx?.stageRaw ?? {},
            stageCtx?.processKey ?? "",
        );
        if (decision.action === "seed" && decision.plan) {
            plan = decision.plan;
            metadata = applyPlanToBuilderStage(metadata, stageKey, plan);
            builderStageUpdated = true;
        } else if (decision.action === "preserve") {
            plan = decision.plan;
        }
    }

    if (builderStageUpdated) {
        const { error } = await supabase
            .from("departments")
            .update({ metadata, updated_at: new Date().toISOString() })
            .eq("id", params.departmentId)
            .eq("org_id", params.orgId);
        if (error) throw new Error(error.message);
    }

    return { metadata, plan, builderStageUpdated };
}
