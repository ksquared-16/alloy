import type { ConfigurationProposalV1 } from "./configurationProposalV1";

export function configLayoutAssistProposalStatusCopy(proposal: ConfigurationProposalV1): string {
    const mutating = proposal.proposed_operations.some((o) => o.kind !== "data_quality_recommendation");
    if (proposal.apply_mode === "recommendation_only" || !mutating) {
        return "Recommendation only — no apply action is needed.";
    }
    return "Pending review — no changes have been applied. Review and approve in Settings.";
}
