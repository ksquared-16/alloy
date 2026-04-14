import type { JobOverviewPlannerSuccess } from "@/lib/agent/planner/jobOverviewPlannerTypes";
import {
    classifySemanticOverviewNoop,
    semanticOverviewNoopHeadline,
} from "@/lib/admin/agentLab/semanticOverviewNoopSummary";

export type AIConfidence = "clear_match" | "partial_match" | "blocked";

export type ResponseKind =
    | "loading"
    | "action_preview"
    | "no_op"
    | "unresolved_only"
    | "applied_success"
    | "error";

export function badgeLabel(c: AIConfidence): string {
    if (c === "clear_match") return "Clear match";
    if (c === "partial_match") return "Partial match";
    return "Unresolved / blocked";
}

export function confidenceFromPlanner(planner: JobOverviewPlannerSuccess): AIConfidence {
    if (!planner.effective_layout_change) return "blocked";
    if (planner.resolution.unresolved_targets.length > 0) return "partial_match";
    return "clear_match";
}

export function headlineForPreview(
    planner: JobOverviewPlannerSuccess
): { headline: string; subline?: string; kind: ResponseKind } {
    if (!planner.effective_layout_change) {
        const k = classifySemanticOverviewNoop(planner);
        const h = semanticOverviewNoopHeadline(k) ?? "No changes to apply";
        return {
            headline: h,
            subline:
                k === "noop_unresolved_only"
                    ? "Some requests could not be placed on the job overview with the current catalog."
                    : "Your current job overview layout already matches this request.",
            kind: k === "noop_unresolved_only" ? "unresolved_only" : "no_op",
        };
    }
    return {
        headline: "Review changes before applying",
        subline: "Preview is ready for the job overview layout.",
        kind: "action_preview",
    };
}

