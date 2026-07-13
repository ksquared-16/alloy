/**
 * Resolve published process/stage configuration used by /processes (lifecycle builder)
 * into inputs for the Current Work template adapter.
 *
 * Source of truth: departments.metadata.lifecycle_builder_v1 stage records —
 * stage_operating_plan_v1, action_catalog_v1, and builder field rules.
 */

import {
    activeLifecycleProcess,
    asOperatorStageKey,
    findStage,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { effectiveFieldRulesForBuilderStage } from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { LifecycleStageFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";

export type PublishedStageInputsForCurrentWork = {
    operatingPlan: StageOperatingPlanV1;
    actionCatalog: StageActionCatalogV1 | null;
    fieldRules: LifecycleStageFieldRules | null;
    processKey: string | null;
    stageKey: string;
    departmentMetadata: Record<string, unknown>;
    processStages: Array<{ key: string; label: string }>;
    processTracks?: ProcessTracksV1 | null;
    operatorGuidance?: string | null;
};

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text.length > 0 ? text : null;
}

/**
 * Read published stage configuration from department metadata — same resolution path
 * as lifecycle stage bootstrap and stage work runtime projection.
 */
export function resolvePublishedStageInputsForCurrentWork(params: {
    departmentMetadata: Record<string, unknown> | null | undefined;
    builderStageKey: string | null | undefined;
}): PublishedStageInputsForCurrentWork | null {
    const stageKey = trimOrNull(params.builderStageKey);
    if (!stageKey) return null;

    const departmentMetadata =
        params.departmentMetadata != null &&
        typeof params.departmentMetadata === "object" &&
        !Array.isArray(params.departmentMetadata)
            ? params.departmentMetadata
            : {};

    const { plan, processKey, stageRecord } = resolveEffectiveStageOperatingPlan({
        departmentMetadata,
        builderStageKey: stageKey,
    });
    if (!plan) return null;

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    const stage = stageRecord ?? (process ? findStage(process, stageKey) : null);
    const actionCatalog = stage?.action_catalog_v1 ?? null;

    const operatorStage = asOperatorStageKey(stageKey);
    const fieldRules = effectiveFieldRulesForBuilderStage(stageKey, departmentMetadata, operatorStage);

    const processStages =
        process?.stages
            ?.filter((s) => s.is_active !== false)
            .map((s) => ({ key: s.key, label: s.label.trim() || s.key })) ?? [];

    return {
        operatingPlan: plan,
        actionCatalog,
        fieldRules: fieldRules.rules,
        processKey: processKey ?? process?.key ?? null,
        stageKey,
        departmentMetadata,
        processStages,
        processTracks: process?.tracks_v1 ?? null,
        operatorGuidance: stage?.operator_guidance?.trim() || null,
    };
}
