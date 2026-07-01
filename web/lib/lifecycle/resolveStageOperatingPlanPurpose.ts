/**
 * Read-only projection of stage_operating_plan_v1.purpose for drawer display.
 */

import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { resolveStageOperatingPlanForStage } from "@/lib/lifecycle/stageOperatingPlanV1";

export type StageOperatingPlanPurposeProjection = {
    stage_key: string;
    stage_label: string;
    purpose: string;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

export function resolveStageOperatingPlanPurpose(params: {
    departmentMetadata: unknown;
    builderStageKey: string | null;
}): StageOperatingPlanPurposeProjection | null {
    const stageKey = trimOrNull(params.builderStageKey);
    if (!stageKey) return null;

    const departmentMetadata =
        params.departmentMetadata != null &&
        typeof params.departmentMetadata === "object" &&
        !Array.isArray(params.departmentMetadata)
            ? (params.departmentMetadata as Record<string, unknown>)
            : {};

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    const stageRecord = process?.stages.find((s) => s.key === stageKey && s.is_active) ?? null;

    const plan =
        resolveStageOperatingPlanForStage(stageRecord ?? {}, stageKey) ??
        (process?.key === ENROLLMENT_PROCESS_KEY ?
            defaultStageOperatingPlanForEnrollmentStage(stageKey)
        :   null);

    const purpose = trimOrNull(plan?.purpose);
    if (!purpose) return null;

    const stage_label = trimOrNull(stageRecord?.label) ?? stageKey;

    return {
        stage_key: stageKey,
        stage_label,
        purpose,
    };
}
