/**
 * Config Layout Assist → Operational Proposal frame copy (BOS UX coherence Cards 10–11).
 */

import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import { proposalHasMutatingOperations } from "@/lib/agent/configLayoutAssist/configLayoutAssistProposalPresentation";
import type { ProposalStatePresentation } from "@/lib/agent/configLayoutAssist/configLayoutAssistProposalPresentation";
import type { BosProposalStatus, BosRiskLevel } from "@/lib/bos/bosCapability";
import type { OperationalProposalFrameVariant } from "@/lib/adminV2/bos/operationalProposalPresentation";
import {
    MUTATION_BOUNDARY_CONFIG_APPROVED_PENDING_APPLY,
    MUTATION_BOUNDARY_CONFIG_NOT_LIVE,
    MUTATION_BOUNDARY_RECOMMENDATION_ONLY,
} from "@/lib/adminV2/bos/bosMutationBoundaryCopy";

export const CONFIG_LAYOUT_ASSIST_PROPOSAL_TYPE_LABEL = "Configuration proposal";
export const CONFIG_LAYOUT_ASSIST_FIELD_SETUP_TYPE_LABEL = "Field setup";
export const CONFIG_LAYOUT_ASSIST_READY_TYPE_LABEL = "Ready to review";
export const CONFIG_LAYOUT_ASSIST_PROPOSAL_SOURCE_LABEL = "Config Assist";

export const CONFIG_LAYOUT_ASSIST_SETTINGS_HUB_COPY =
    "Same proposal as Settings → Config proposals. Use advanced review for full lifecycle and apply controls.";

export const CONFIG_LAYOUT_ASSIST_MUTATION_BOUNDARY_COPY = MUTATION_BOUNDARY_CONFIG_NOT_LIVE;

export function configProposalEntityContextLabel(proposal: ConfigurationProposalV1): string | null {
    const meta = proposal.metadata;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        const label = (meta as Record<string, unknown>).entity_display_label;
        if (typeof label === "string" && label.trim()) return label.trim();
    }
    const entity = proposal.impacted_entities[0];
    return entity?.trim() ? entity.trim() : null;
}

export function configProposalRequiresFrameApproval(proposal: ConfigurationProposalV1): boolean {
    if (proposal.apply_mode === "recommendation_only") return false;
    return proposal.requires_approval && proposalHasMutatingOperations(proposal);
}

export function configProposalRiskLevel(proposal: ConfigurationProposalV1): BosRiskLevel {
    return proposal.risk_level;
}

export function configProposalValidationMessages(proposal: ConfigurationProposalV1): {
    errors: string[];
    warnings: string[];
} {
    const warnings = (proposal.warnings ?? [])
        .filter((w) => w.severity === "warning")
        .map((w) => w.message);
    const errors = (proposal.warnings ?? [])
        .filter((w) => w.severity === "error")
        .map((w) => w.message);
    return { errors, warnings };
}

export function mapConfigLifecycleToBosStatus(state: string): BosProposalStatus | null {
    switch (state) {
        case "draft":
            return "draft";
        case "reviewed":
            return "validated";
        case "approved":
            return "approved";
        case "applied":
            return "applied";
        case "failed":
            return "failed";
        case "rejected":
            return "rejected";
        default:
            return null;
    }
}

export function mapConfigLifecycleToFrameVariant(
    statePresentation: ProposalStatePresentation,
    state: string
): OperationalProposalFrameVariant {
    if (state === "applied") return "applied";
    if (state === "failed") return "failed";
    if (state === "rejected") return "blocked";
    if (statePresentation.needsConfirmation) return "review_required";
    if (state === "approved" && !statePresentation.isRecommendationOnly) return "review_required";
    return "normal";
}

export function configProposalMutationBoundaryCopy(
    statePresentation: ProposalStatePresentation
): string | null {
    if (statePresentation.isRecommendationOnly) {
        return MUTATION_BOUNDARY_RECOMMENDATION_ONLY;
    }
    if (statePresentation.needsConfirmation) {
        return CONFIG_LAYOUT_ASSIST_MUTATION_BOUNDARY_COPY;
    }
    if (statePresentation.stateLabel.includes("Approved")) {
        return MUTATION_BOUNDARY_CONFIG_APPROVED_PENDING_APPLY;
    }
    return CONFIG_LAYOUT_ASSIST_MUTATION_BOUNDARY_COPY;
}
