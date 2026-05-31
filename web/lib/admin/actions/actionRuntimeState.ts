import type { EffectiveRequirementsResult } from "@/lib/completion/effectiveRequirementsTypes";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

export type ActionRuntimeState = "not_placed" | "visible_executable" | "visible_blocked";

/**
 * Valid = lifecycle/status/entity rules (placement conditions + definition active).
 * Visible = placed on surface.
 * Executable = valid + passes requirement preflight.
 */
export function classifyActionRuntimeState(input: {
    action: ResolvedActionForClient;
    placed: boolean;
    validForContext: boolean;
    preflight: EffectiveRequirementsResult | null;
}): ActionRuntimeState {
    if (!input.placed || !input.validForContext) return "not_placed";
    if (input.preflight && !input.preflight.ok) return "visible_blocked";
    return "visible_executable";
}

export function formatActionPreflightBlockerSummary(preflight: EffectiveRequirementsResult): string {
    const labels = preflight.blocking.map((v) => v.label);
    if (labels.length === 0) return "Complete required information before running this action.";
    if (labels.length === 1) return `${labels[0]} is required before this action can run.`;
    return `Missing: ${labels.slice(0, 4).join(", ")}.`;
}
