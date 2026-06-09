import type { ActionWorkspaceBosSuggestion } from "@/lib/admin/actions/actionWorkspaceTypes";

export type BosConfidenceLevel = ActionWorkspaceBosSuggestion["confidence"];

export const BOS_CONFIDENCE_STYLES: Record<
    BosConfidenceLevel,
    { badge: string; border: string; label: string }
> = {
    high: {
        badge: "bg-alloy-pine/12 text-alloy-pine border-alloy-pine/25",
        border: "border-l-alloy-pine",
        label: "High confidence",
    },
    medium: {
        badge: "bg-amber-100 text-amber-950 border-amber-200",
        border: "border-l-amber-400",
        label: "Needs review",
    },
    low: {
        badge: "bg-red-100 text-red-900 border-red-200",
        border: "border-l-red-500",
        label: "Low confidence",
    },
};

/** Height reserved for BOS Command Center + workspace padding (matches shell chrome). */
export const ACTION_WORKSPACE_VIEWPORT_INSET = "8.5rem";

export function allSuggestionsHighConfidence(suggestions: ActionWorkspaceBosSuggestion[]): boolean {
    return suggestions.length > 0 && suggestions.every((s) => s.confidence === "high");
}

export function missingPlatformKeysFromSuggestions(
    suggestions: ActionWorkspaceBosSuggestion[],
    selectedOnly = true
): string[] {
    const pool = selectedOnly ? suggestions.filter((s) => s.selected) : suggestions;
    const keys = new Set(pool.map((s) => s.payload_key));
    const missing: string[] = [];
    if (!keys.has("first_name")) missing.push("Parent first name");
    if (!keys.has("last_name")) missing.push("Parent last name");
    if (!keys.has("email") && !keys.has("phone")) missing.push("Email or phone");
    return missing;
}
