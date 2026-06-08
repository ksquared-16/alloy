import type { BosProposalEnvelopeV1 } from "@/lib/bos/bosProposalEnvelope";
import { BOS_PROPOSAL_ENVELOPE_VERSION } from "@/lib/bos/bosProposalEnvelope";
import { getBosCapabilityDefinition } from "@/lib/bos/bosCapabilityRegistry";
import type { AgentV0QueueDefinitionCommitPayloadV1 } from "@/lib/bos/adapters/agentConfigCommitTypes";

export type AgentV0ToBosEnvelopeOptions = {
    status?: BosProposalEnvelopeV1["status"];
    source_surface?: string;
};

export function agentV0QueueDefinitionToBosProposalEnvelope(
    payload: AgentV0QueueDefinitionCommitPayloadV1,
    options: AgentV0ToBosEnvelopeOptions = {}
): BosProposalEnvelopeV1 {
    const def = getBosCapabilityDefinition("agent_v0_queue_definition");
    const surface = options.source_surface ?? "admin_agent_v0";
    const createdAt = payload.created_at ?? new Date().toISOString();

    return {
        version: BOS_PROPOSAL_ENVELOPE_VERSION,
        proposal_id: payload.proposal_id,
        capability_key: "agent_v0_queue_definition",
        agent_key: null,
        domain: def.domain,
        status: options.status ?? "draft",
        risk_level: def.default_risk_level,
        requires_approval: def.requires_human_approval,
        summary: `Update queue_definition on work unit ${payload.slots.work_unit_id}`,
        affected_surfaces: [surface, `work_unit:${payload.slots.work_unit_id}`],
        validation: { ok: true, errors: [], warnings: [] },
        warnings: [],
        diff: {
            summary_lines: [
                `intent_type: ${payload.intent_type}`,
                `expected_queue_definition_version: ${payload.slots.expected_queue_definition_version}`,
            ],
        },
        source: {
            surface,
            org_id: payload.org_id,
            actor_user_id: payload.actor_user_id,
            module: "web/lib/agent/v0/",
        },
        created_at: createdAt,
        raw_payload: payload,
        correlation_id: payload.correlation_id,
        request_id: payload.request_id,
    };
}
