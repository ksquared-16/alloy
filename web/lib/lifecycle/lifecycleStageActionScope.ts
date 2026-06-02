/** Lifecycle Builder — action visibility scope (placement still controls surface). */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";

export type LifecycleActionScope = "lifecycle" | "stage";

export const LIFECYCLE_ACTION_SCOPE_LABELS: Record<LifecycleActionScope, string> = {
    lifecycle: "Lifecycle-wide",
    stage: "Stage-specific",
};

export const LIFECYCLE_BUILDER_CONFIGURED_KEY = "lifecycle_builder_configured" as const;

export function defaultActionScopeForBaseKey(baseActionKey: string): LifecycleActionScope {
    if (baseActionKey === "create_record" || baseActionKey === "change_status" || baseActionKey === "create_task") {
        return "lifecycle";
    }
    return "stage";
}

export function isLifecycleBuilderConfiguredPlacement(conditionConfig: unknown): boolean {
    if (conditionConfig == null || typeof conditionConfig !== "object" || Array.isArray(conditionConfig)) {
        return false;
    }
    const o = conditionConfig as Record<string, unknown>;
    if (o[LIFECYCLE_BUILDER_CONFIGURED_KEY] === true) return true;
    return o.lifecycle_action_scope === "lifecycle" || o.lifecycle_action_scope === "stage";
}

export function parseLifecycleActionScopeFromConditionConfig(
    conditionConfig: Record<string, unknown> | null | undefined
): LifecycleActionScope {
    if (!conditionConfig || typeof conditionConfig !== "object") return "stage";
    const scope = conditionConfig.lifecycle_action_scope;
    if (scope === "lifecycle") return "lifecycle";
    return "stage";
}

function normalizeOperatorStages(stages: readonly string[]): LifecycleOperatorStage[] {
    const out: LifecycleOperatorStage[] = [];
    for (const s of stages) {
        const t = s.trim();
        if ((LIFECYCLE_STAGE_ORDER as readonly string[]).includes(t) && !out.includes(t as LifecycleOperatorStage)) {
            out.push(t as LifecycleOperatorStage);
        }
    }
    return out;
}

export function parseLifecycleOperatorStagesFromConditionConfig(
    conditionConfig: Record<string, unknown> | null | undefined
): LifecycleOperatorStage[] {
    if (!conditionConfig || typeof conditionConfig !== "object") return [];
    const multi = conditionConfig.lifecycle_operator_stages;
    if (Array.isArray(multi)) {
        return normalizeOperatorStages(multi.map(String));
    }
    const single = conditionConfig.lifecycle_operator_stage;
    if (typeof single === "string" && single.trim()) {
        return normalizeOperatorStages([single]);
    }
    return [];
}

export function buildLifecycleActionConditionConfig(
    scope: LifecycleActionScope,
    operatorStages: readonly string[]
): Record<string, unknown> {
    const base: Record<string, unknown> = {
        [LIFECYCLE_BUILDER_CONFIGURED_KEY]: true,
        lifecycle_action_scope: scope,
    };
    if (scope === "lifecycle") return base;
    const stages = normalizeOperatorStages(operatorStages);
    if (stages.length === 1) {
        return {
            ...base,
            lifecycle_operator_stage: stages[0],
            lifecycle_operator_stages: stages,
        };
    }
    return {
        ...base,
        lifecycle_operator_stages: stages,
    };
}

/** Whether a configured action appears on the given operator stage at runtime. */
export function configuredActionVisibleOnStage(
    scope: LifecycleActionScope,
    operatorStages: readonly string[],
    viewStage: string
): boolean {
    if (scope === "lifecycle") return true;
    if (!operatorStages.length) return true;
    return operatorStages.includes(viewStage);
}

export function placementMatchesStageBootstrap(
    conditionConfig: Record<string, unknown> | null | undefined,
    operatorStage: string
): boolean {
    if (!conditionConfig || typeof conditionConfig !== "object") return false;
    if (!isLifecycleBuilderConfiguredPlacement(conditionConfig)) return false;
    const scope = parseLifecycleActionScopeFromConditionConfig(conditionConfig);
    if (scope === "lifecycle") return true;
    const stages = parseLifecycleOperatorStagesFromConditionConfig(conditionConfig);
    if (!stages.length) return true;
    return stages.includes(operatorStage as LifecycleOperatorStage);
}
