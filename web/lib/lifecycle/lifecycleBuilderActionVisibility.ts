/**
 * Lifecycle Builder action placements — stage visibility on workspace surfaces.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    isLifecycleBuilderConfiguredPlacement,
    parseLifecycleActionScopeFromConditionConfig,
    parseLifecycleOperatorStagesFromConditionConfig,
    type LifecycleActionScope,
} from "@/lib/lifecycle/lifecycleStageActionScope";

export function builderStageKeyMatchesViewStage(
    restrictedStages: readonly string[],
    viewBuilderStageKey: string
): boolean {
    const view = viewBuilderStageKey.trim();
    if (!view) return false;
    for (const raw of restrictedStages) {
        const s = raw.trim();
        if (!s) continue;
        if (s === view) return true;
        const viewOp = asOperatorStageKey(view);
        const restrictedOp = asOperatorStageKey(s);
        if (viewOp && s === viewOp) return true;
        if (restrictedOp && restrictedOp === view) return true;
    }
    return false;
}

/** Whether a lifecycle-builder placement is visible for the current work unit stage. */
export function lifecycleBuilderPlacementVisibleOnStage(
    conditionConfig: Record<string, unknown> | null | undefined,
    viewBuilderStageKey: string | null | undefined
): boolean {
    if (!conditionConfig || typeof conditionConfig !== "object") return true;
    if (!isLifecycleBuilderConfiguredPlacement(conditionConfig)) return true;
    const scope = parseLifecycleActionScopeFromConditionConfig(conditionConfig);
    if (scope === "lifecycle") return true;
    const restricted = parseLifecycleOperatorStagesFromConditionConfig(conditionConfig);
    if (!restricted.length) return true;
    const view = (viewBuilderStageKey ?? "").trim();
    if (!view) return false;
    return builderStageKeyMatchesViewStage(restricted, view);
}

export function configuredActionVisibleOnStage(
    scope: LifecycleActionScope,
    operatorStages: readonly string[],
    viewStage: string
): boolean {
    if (scope === "lifecycle") return true;
    if (!operatorStages.length) return true;
    return builderStageKeyMatchesViewStage(operatorStages, viewStage);
}
