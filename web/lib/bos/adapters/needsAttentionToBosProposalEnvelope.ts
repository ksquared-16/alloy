import type { BosProposalEnvelopeV1 } from "@/lib/bos/bosProposalEnvelope";
import { BOS_PROPOSAL_ENVELOPE_VERSION } from "@/lib/bos/bosProposalEnvelope";
import { getBosCapabilityDefinition } from "@/lib/bos/bosCapabilityRegistry";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { NEEDS_ATTENTION_SUGGESTION_AGENT_KEY } from "@/lib/agent/needsAttentionSuggestion/types";

export type NeedsAttentionToBosEnvelopeOptions = {
    source_surface?: string;
    org_id: string;
};

export function needsAttentionSuggestionToBosProposalEnvelope(
    suggestion: AttentionSuggestionV1,
    options: NeedsAttentionToBosEnvelopeOptions
): BosProposalEnvelopeV1 {
    const def = getBosCapabilityDefinition("needs_attention_suggestion");
    const surface = options.source_surface ?? "opportunity_drawer";

    return {
        version: BOS_PROPOSAL_ENVELOPE_VERSION,
        proposal_id: suggestion.suggestion_id,
        capability_key: "needs_attention_suggestion",
        agent_key: suggestion.agent_key ?? NEEDS_ATTENTION_SUGGESTION_AGENT_KEY,
        domain: def.domain,
        status: "validated",
        risk_level: def.default_risk_level,
        requires_approval: false,
        summary: suggestion.reasoning.summary,
        affected_surfaces: [
            surface,
            `entity:${suggestion.target.entity_type}:${suggestion.target.entity_id}`,
        ],
        validation: { ok: true, errors: [], warnings: [] },
        warnings: [],
        diff: {
            summary_lines: [
                `next_action: ${suggestion.next_action.label}`,
                `primary_reason: ${suggestion.source.primary_reason_code ?? "none"}`,
            ],
        },
        source: {
            surface,
            org_id: options.org_id,
            module: "web/lib/agent/needsAttentionSuggestion/",
        },
        created_at: suggestion.generated_at_iso,
        raw_payload: suggestion,
    };
}
