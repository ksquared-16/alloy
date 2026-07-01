/**
 * Build BOS proposal envelopes from command-surface action cards (internal thread metadata).
 */

import type { BosProposalEnvelopeV1 } from "@/lib/bos/bosProposalEnvelope";
import { configurationProposalToBosProposalEnvelope } from "@/lib/bos/adapters/configurationProposalToBosProposalEnvelope";
import { workflowAssistSuggestionToBosProposalEnvelope } from "@/lib/bos/adapters/workflowAssistToBosProposalEnvelope";
import type { ConfigLayoutAssistProposalState } from "@/lib/agent/configLayoutAssist/configurationProposalState";
import type { CommandSurfaceActionCard } from "@/lib/bos/commandSurfaceBosMetadata";
import { withCommandSurfaceCardCapabilityKey } from "@/lib/bos/commandSurfaceBosMetadata";

export type BosCommandSurfaceEnvelopeContext = {
    org_id?: string;
    actor_user_id?: string | null;
    source_surface?: string;
    config_lifecycle_state?: ConfigLayoutAssistProposalState;
};

export function buildBosEnvelopeForCommandSurfaceCard(
    card: CommandSurfaceActionCard,
    context: BosCommandSurfaceEnvelopeContext = {}
): BosProposalEnvelopeV1 | null {
    const surface = context.source_surface ?? "command_surface";

    if (card.type === "workflow_assist_proposal") {
        return workflowAssistSuggestionToBosProposalEnvelope(card.suggestion, {
            source_surface: surface,
            status: "draft",
        });
    }

    if (card.type === "config_layout_assist_proposal" || card.type === "config_layout_assist_ready") {
        return configurationProposalToBosProposalEnvelope(card.proposal, {
            org_id: context.org_id ?? "",
            actor_user_id: context.actor_user_id ?? card.proposal.created_by ?? null,
            source_surface: surface,
            lifecycle_state:
                context.config_lifecycle_state ??
                (card.type === "config_layout_assist_ready" ? "reviewed" : "draft"),
        });
    }

    return null;
}

/** JSON-safe summary for diagnostics / future proposal inbox (no PII from raw_payload). */
export function buildBosEnvelopeLogSummary(envelope: BosProposalEnvelopeV1): Record<string, unknown> {
    return {
        version: envelope.version,
        proposal_id: envelope.proposal_id,
        capability_key: envelope.capability_key,
        agent_key: envelope.agent_key,
        status: envelope.status,
        risk_level: envelope.risk_level,
        requires_approval: envelope.requires_approval,
        summary: envelope.summary,
        affected_surfaces: envelope.affected_surfaces,
        validation_ok: envelope.validation.ok,
        warning_count: envelope.warnings.length,
        source_surface: envelope.source.surface,
        org_id: envelope.source.org_id,
    };
}

export function enrichCommandSurfaceCardWithBosMetadata<T extends CommandSurfaceActionCard>(
    card: T,
    context?: BosCommandSurfaceEnvelopeContext
): {
    card: T & { capability_key: import("@/lib/bos/bosCapability").BosCapabilityKey };
    bos_envelope: BosProposalEnvelopeV1 | null;
} {
    const cardWithKey = withCommandSurfaceCardCapabilityKey(card);
    const bos_envelope = buildBosEnvelopeForCommandSurfaceCard(cardWithKey, context);
    return { card: cardWithKey, bos_envelope };
}
