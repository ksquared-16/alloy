/**
 * Canonical stage operating plan resolution — single source for spawn, projection, and automation.
 */

import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import {
    activeLifecycleProcess,
    findStage,
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import {
    resolveStageOperatingPlanForStage,
    type StageOperatingPlanV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

export type EffectiveStageOperatingPlanSource = "explicit" | "enrollment_default" | null;

export type EffectiveStageOperatingPlanResult = {
    plan: StageOperatingPlanV1 | null;
    source: EffectiveStageOperatingPlanSource;
    stageRecord: LifecycleBuilderStageRecord | null;
    processKey: string | null;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

/** Resolve the effective operating plan for a builder stage (explicit metadata or enrollment default). */
export function resolveEffectiveStageOperatingPlan(params: {
    departmentMetadata: Record<string, unknown> | null | undefined;
    builderStageKey: string | null | undefined;
}): EffectiveStageOperatingPlanResult {
    const stageKey = trimOrNull(params.builderStageKey);
    if (!stageKey) {
        return { plan: null, source: null, stageRecord: null, processKey: null };
    }

    const departmentMetadata =
        params.departmentMetadata != null &&
        typeof params.departmentMetadata === "object" &&
        !Array.isArray(params.departmentMetadata)
            ? params.departmentMetadata
            : {};

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    const stageRecord = process ? findStage(process, stageKey) : null;
    const explicit = resolveStageOperatingPlanForStage(stageRecord ?? {}, stageKey);
    if (explicit) {
        return {
            plan: explicit,
            source: "explicit",
            stageRecord,
            processKey: process?.key ?? null,
        };
    }

    if (process?.key === ENROLLMENT_PROCESS_KEY) {
        const fallback = defaultStageOperatingPlanForEnrollmentStage(stageKey);
        if (fallback) {
            return {
                plan: fallback,
                source: "enrollment_default",
                stageRecord,
                processKey: process.key,
            };
        }
    }

    return { plan: null, source: null, stageRecord, processKey: process?.key ?? null };
}
