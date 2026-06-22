import type { CreateLeadCommitResolutionState } from "@/lib/intake/resolve/commitOverlayTypes";

export function resolutionStateLabel(state: CreateLeadCommitResolutionState): string {
    switch (state) {
        case "linked":
            return "Linked";
        case "possible_match":
            return "Possible match";
        case "conflict":
            return "Conflict";
        case "new":
            return "New";
        default:
            return "New";
    }
}

export function resolutionStateBadgeClass(state: CreateLeadCommitResolutionState): string {
    switch (state) {
        case "linked":
            return "bg-[#00A283]/10 text-[#007A63]";
        case "possible_match":
            return "bg-amber-100 text-amber-900";
        case "conflict":
            return "bg-red-100 text-red-800";
        case "new":
            return "bg-alloy-stone/10 text-alloy-midnight/55";
        default:
            return "bg-alloy-stone/10 text-alloy-midnight/55";
    }
}

export function resolutionSummaryLine(input: {
    state: CreateLeadCommitResolutionState;
    matchDisplayName?: string | null;
    entityLabel: string;
}): string | null {
    if (input.state === "new") return null;
    if (input.state === "linked" && input.matchDisplayName) {
        return `Existing ${input.entityLabel} found: ${input.matchDisplayName}`;
    }
    if (input.state === "possible_match") {
        return input.matchDisplayName ?
                `Possible match: ${input.matchDisplayName}`
            :   "Possible match found — review before commit.";
    }
    if (input.state === "conflict") {
        return "Conflict — review required before commit.";
    }
    return null;
}
