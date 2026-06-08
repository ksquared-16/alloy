import type { BosProposalEnvelopeV1 } from "@/lib/bos/bosProposalEnvelope";
import { BOS_PROPOSAL_ENVELOPE_VERSION } from "@/lib/bos/bosProposalEnvelope";
import { getBosCapabilityDefinition } from "@/lib/bos/bosCapabilityRegistry";
import type { AgentV2FieldVisibilityCommitPayloadV1 } from "@/lib/bos/adapters/agentConfigCommitTypes";

export type AgentV2ToBosEnvelopeOptions = {
    status?: BosProposalEnvelopeV1["status"];
    source_surface?: string;
};

export function agentV2FieldVisibilityToBosProposalEnvelope(
    payload: AgentV2FieldVisibilityCommitPayloadV1,
    options: AgentV2ToBosEnvelopeOptions = {}
): BosProposalEnvelopeV1 {
    const def = getBosCapabilityDefinition("agent_v2_field_visibility");
    const surface = options.source_surface ?? "admin_agent_v2";
    const createdAt = payload.created_at ?? new Date().toISOString();

    return {
        version: BOS_PROPOSAL_ENVELOPE_VERSION,
        proposal_id: payload.proposal_id,
        capability_key: "agent_v2_field_visibility",
        agent_key: null,
        domain: def.domain,
        status: options.status ?? "draft",
        risk_level: def.default_risk_level,
        requires_approval: def.requires_human_approval,
        summary: `Update field visibility for ${payload.slots.field_definition_id}`,
        affected_surfaces: [surface, `field_definition:${payload.slots.field_definition_id}`],
        validation: { ok: true, errors: [], warnings: [] },
        warnings: [],
        diff: {
            summary_lines: [
                `intent_type: ${payload.intent_type}`,
                `expected_updated_at: ${payload.slots.expected_updated_at}`,
            ],
        },
        source: {
            surface,
            org_id: payload.org_id,
            actor_user_id: payload.actor_user_id,
            module: "web/lib/agent/v2/",
        },
        created_at: createdAt,
        raw_payload: payload,
        correlation_id: payload.correlation_id,
        request_id: payload.request_id,
    };
}
