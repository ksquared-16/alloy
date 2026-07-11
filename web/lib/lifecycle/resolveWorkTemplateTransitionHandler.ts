/**
 * Map work-template transition_ref values to executable action handler keys.
 * Transition refs use `move_to_stage:{stage_key}` from /processes editor options.
 */

import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { getPlatformAction } from "@/lib/platform/actions/platformActionCatalog";

export function resolveTransitionRefToHandlerKey(
    transitionRef: string,
    actionCatalog?: StageActionCatalogV1 | null,
): string {
    const ref = transitionRef.trim();
    if (!ref) return ref;
    if (!ref.startsWith("move_to_stage:")) return ref;

    const targetStageKey = ref.slice("move_to_stage:".length).trim();
    if (!targetStageKey) return ref;

    for (const candidate of actionCatalog?.candidate_actions ?? []) {
        const key = candidate.action_key.trim();
        if (!key) continue;
        if (candidate.recommendation !== "context_dependent") continue;
        if (key.includes(targetStageKey)) return key;
    }

    if (canonicalActionDefinition(ref)?.runtimeWired) return ref;
    if (getPlatformAction(ref)) return ref;

    return ref;
}
