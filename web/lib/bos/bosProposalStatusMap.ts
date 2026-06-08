/**
 * Map native capability statuses → BosProposalStatus (normalization only).
 */

import type { BosProposalStatus } from "@/lib/bos/bosCapability";
import type { ConfigLayoutAssistProposalState } from "@/lib/agent/configLayoutAssist/configurationProposalState";

export function mapConfigLayoutAssistStateToBosStatus(state: ConfigLayoutAssistProposalState): BosProposalStatus {
    switch (state) {
        case "draft":
            return "draft";
        case "reviewed":
            return "validated";
        case "approved":
            return "approved";
        case "applied":
            return "applied";
        case "rejected":
            return "rejected";
        case "failed":
            return "failed";
        case "rolled_back":
            return "superseded";
        default: {
            const _exhaustive: never = state;
            return _exhaustive;
        }
    }
}
