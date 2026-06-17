/**
 * Resolve effective stage operating plans for all stages in the active lifecycle process.
 */

import {
    activeLifecycleProcess,
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type EffectiveStageOperatingPlanEntry = {
    stageKey: string;
    plan: StageOperatingPlanV1;
};

export function listEffectiveStageOperatingPlansForProcess(
    departmentMetadata: Record<string, unknown> | null | undefined,
): EffectiveStageOperatingPlanEntry[] {
    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    if (!process) return [];

    const entries: EffectiveStageOperatingPlanEntry[] = [];
    for (const stage of activeStagesForProcess(process)) {
        const { plan } = resolveEffectiveStageOperatingPlan({
            departmentMetadata,
            builderStageKey: stage.key,
        });
        if (plan) entries.push({ stageKey: stage.key, plan });
    }
    return entries;
}
