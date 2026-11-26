/**
 * Work Template bucket configuration source — explicit vs legacy fallback.
 *
 * undefined → legacy fallback allowed at runtime
 * []        → explicitly configured empty
 */

import type { StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { resolveWorkTemplateExecutionMode } from "@/lib/lifecycle/resolveWorkTemplateExecutionMode";

export type WorkTemplateBucketConfigSource = "explicit" | "fallback" | "explicit_empty";

export function primaryActionConfigSource(work: StageWorkTemplateV1): WorkTemplateBucketConfigSource {
    if (work.primary_action?.action_ref?.trim()) return "explicit";
    // Explicit outcome-led (No direct action) is configured empty — not a legacy fallback.
    if (work.execution_mode === "outcome_led") return "explicit_empty";
    // Legacy published plans without execution_mode and without primary_action still fall back.
    if (work.execution_mode === "direct_action") return "explicit_empty";
    return "fallback";
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

/** @deprecated Prefer availableOutcomesConfigSource — Results renamed to Outcomes. */
export function availableResultsConfigSource(work: StageWorkTemplateV1): WorkTemplateBucketConfigSource {
    return availableOutcomesConfigSource(work);
}

export function availableOutcomesConfigSource(work: StageWorkTemplateV1): WorkTemplateBucketConfigSource {
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

export function workTemplateExecutionModeSourceLabel(work: StageWorkTemplateV1): string {
    const mode = resolveWorkTemplateExecutionMode(work);
    return mode === "direct_action"
        ? "Execution: Direct action"
        : "Execution: Outcome-led (Record Outcome leads)";
}
