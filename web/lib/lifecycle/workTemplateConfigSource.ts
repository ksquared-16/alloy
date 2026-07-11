/**
 * Work Template bucket configuration source — explicit vs legacy fallback.
 *
 * undefined → legacy fallback allowed at runtime
 * []        → explicitly configured empty
 */

import type { StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type WorkTemplateBucketConfigSource = "explicit" | "fallback" | "explicit_empty";

export function primaryActionConfigSource(work: StageWorkTemplateV1): WorkTemplateBucketConfigSource {
    return work.primary_action?.action_ref?.trim() ? "explicit" : "fallback";
}

export function helpfulActionsConfigSource(work: StageWorkTemplateV1): WorkTemplateBucketConfigSource {
    if (work.helpful_actions !== undefined) {
        return work.helpful_actions.length === 0 ? "explicit_empty" : "explicit";
    }
    return "fallback";
}

export function alternatePathsConfigSource(work: StageWorkTemplateV1): WorkTemplateBucketConfigSource {
    if (work.alternate_paths !== undefined) {
        return work.alternate_paths.length === 0 ? "explicit_empty" : "explicit";
    }
    return "fallback";
}

export function availableResultsConfigSource(work: StageWorkTemplateV1): WorkTemplateBucketConfigSource {
    if (work.outcome_refs !== undefined) {
        return work.outcome_refs.length === 0 ? "explicit_empty" : "explicit";
    }
    return "fallback";
}

export function workTemplateConfigSourceLabel(source: WorkTemplateBucketConfigSource): string {
    switch (source) {
        case "explicit":
            return "Configured on this Work Item";
        case "explicit_empty":
            return "Explicitly configured empty";
        case "fallback":
            return "Using stage recommendations";
    }
}
