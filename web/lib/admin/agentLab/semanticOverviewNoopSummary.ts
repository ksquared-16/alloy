import type { JobOverviewPlannerSuccess } from "@/lib/agent/planner/jobOverviewPlannerTypes";

export type SemanticOverviewNoopKind = "change" | "noop_already_satisfied" | "noop_unresolved_only";

/**
 * Classifies semantic planner outcome for Agent Config Lab no-op UX (no LLM).
 */
export function classifySemanticOverviewNoop(planner: JobOverviewPlannerSuccess): SemanticOverviewNoopKind {
    if (planner.effective_layout_change) return "change";
    if (planner.resolution.unresolved_targets.length > 0) return "noop_unresolved_only";
    return "noop_already_satisfied";
}

export function semanticOverviewNoopHeadline(kind: SemanticOverviewNoopKind): string | null {
    switch (kind) {
        case "change":
            return null;
        case "noop_already_satisfied":
            return "This request is already satisfied by the current layout.";
        case "noop_unresolved_only":
            return "This request only referenced unsupported overview targets (e.g. phone/email), so no layout change is proposed.";
        default:
            return null;
    }
}

/**
 * When true, Apply should not POST unless the user opts in (audit / version churn).
 * v1 overview_financial and v2 paths are unaffected (no semantic planner snapshot).
 *
 * **Server-side:** the v1 agent route may later reject no-op applies by comparing normalized config
 * fingerprints (defense in depth). Today this client guard is the primary protection in Agent Lab.
 */
export function shouldBlockSemanticNoopApply(params: {
    previewRoute: "v1" | "v2" | null;
    semanticPlanner: JobOverviewPlannerSuccess | null;
    applySemanticNoopAnyway: boolean;
}): boolean {
    if (params.previewRoute !== "v1" || !params.semanticPlanner) return false;
    if (params.semanticPlanner.effective_layout_change) return false;
    return !params.applySemanticNoopAnyway;
}
