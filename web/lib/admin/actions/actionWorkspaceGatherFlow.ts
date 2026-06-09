import type {
    ActionWorkspaceBosSuggestion,
    ActionWorkspaceGatherPhase,
} from "@/lib/admin/actions/actionWorkspaceTypes";
import { allSuggestionsHighConfidence } from "@/lib/admin/actions/actionWorkspaceBosTheme";
import { validateCreateLeadPlatformMinimum } from "@/lib/admin/actions/createLeadPlatformGather";

export type { ActionWorkspaceGatherPhase };

export function canFastPathCreateLead(input: {
    gatherPhase: ActionWorkspaceGatherPhase;
    values: Record<string, string>;
    appliedFromBos: boolean;
    valuesEditedAfterApply: boolean;
    lastAppliedSuggestions: ActionWorkspaceBosSuggestion[];
}): boolean {
    const validation = validateCreateLeadPlatformMinimum(input.values);
    if (!validation.ok) return false;
    if (input.gatherPhase !== "details") return false;
    if (!input.appliedFromBos || input.valuesEditedAfterApply) return false;
    if (!allSuggestionsHighConfidence(input.lastAppliedSuggestions)) return false;
    return true;
}
