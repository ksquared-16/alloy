import type {
    IntakeRecordMatchConfidence,
    IntakeRecordResolutionAction,
    IntakeRecordResolutionCandidate,
    IntakeRecordResolutionProposal,
    IntakeRecordResolutionResult,
    IntakeRecordResolutionSummary,
} from "@/lib/intake/resolve/types";

export function makeMatchCandidateId(entityType: string, entityId: string): string {
    return `match:${entityType}:${entityId}`;
}

export function defaultActionForConfidence(confidence: IntakeRecordMatchConfidence): IntakeRecordResolutionAction {
    switch (confidence) {
        case "exact_match":
            return "link_existing";
        case "probable_match":
        case "possible_match":
            return "review_required";
        case "conflict":
            return "reject";
        case "no_match":
            return "create_new";
        default:
            return "create_new";
    }
}

export function resolutionStateFromConfidence(
    confidence: IntakeRecordMatchConfidence,
    action: IntakeRecordResolutionAction,
): "new" | "linked" | "possible_match" | "conflict" {
    if (confidence === "conflict" || action === "reject") return "conflict";
    if (action === "link_existing" && confidence === "exact_match") return "linked";
    if (confidence === "probable_match" || confidence === "possible_match" || action === "review_required") {
        return "possible_match";
    }
    return "new";
}

export function buildResolutionSummary(
    proposals: IntakeRecordResolutionProposal[],
): IntakeRecordResolutionSummary {
    const summary: IntakeRecordResolutionSummary = {
        auto_link_count: 0,
        review_required_count: 0,
        create_new_count: 0,
        conflict_count: 0,
    };
    for (const proposal of proposals) {
        if (proposal.confidence === "conflict" || proposal.action === "reject") {
            summary.conflict_count += 1;
        } else if (proposal.action === "link_existing") {
            summary.auto_link_count += 1;
        } else if (proposal.action === "review_required") {
            summary.review_required_count += 1;
        } else if (proposal.action === "create_new") {
            summary.create_new_count += 1;
        }
    }
    return summary;
}

export function assembleResolutionResult(input: {
    source_kind: string;
    source_id?: string;
    candidates: IntakeRecordResolutionCandidate[];
    proposals: IntakeRecordResolutionProposal[];
}): IntakeRecordResolutionResult {
    return {
        source_kind: input.source_kind,
        source_id: input.source_id,
        candidates: input.candidates,
        proposals: input.proposals,
        summary: buildResolutionSummary(input.proposals),
    };
}
