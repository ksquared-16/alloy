import type { BosProposalEnvelopeV1 } from "@/lib/bos/bosProposalEnvelope";
import { BOS_PROPOSAL_ENVELOPE_VERSION } from "@/lib/bos/bosProposalEnvelope";
import { getBosCapabilityDefinition } from "@/lib/bos/bosCapabilityRegistry";
import type { AgentV1RecordOverviewLayoutCommitPayloadV1 } from "@/lib/bos/adapters/agentConfigCommitTypes";

export type AgentV1ToBosEnvelopeOptions = {
    status?: BosProposalEnvelopeV1["status"];
    source_surface?: string;
};

export function agentV1RecordOverviewLayoutToBosProposalEnvelope(
    payload: AgentV1RecordOverviewLayoutCommitPayloadV1,
    options: AgentV1ToBosEnvelopeOptions = {}
): BosProposalEnvelopeV1 {
    const def = getBosCapabilityDefinition("agent_v1_record_overview_layout");
    const surface = options.source_surface ?? "admin_agent_v1";
    const createdAt = payload.created_at ?? new Date().toISOString();

    return {
        version: BOS_PROPOSAL_ENVELOPE_VERSION,
        proposal_id: payload.proposal_id,
        capability_key: "agent_v1_record_overview_layout",
        agent_key: null,
        domain: def.domain,
        status: options.status ?? "draft",
        risk_level: def.default_risk_level,
        requires_approval: def.requires_human_approval,
        summary: `Update ${payload.slots.entity_type} record overview layout (${payload.slots.surface})`,
        affected_surfaces: [
            surface,
            `entity:${payload.slots.entity_type}`,
            `layout:${payload.slots.target_kind}`,
        ],
        validation: { ok: true, errors: [], warnings: [] },
        warnings: [],
        diff: {
            summary_lines: [
                `intent_type: ${payload.intent_type}`,
                `expected_config_version: ${payload.slots.expected_config_version}`,
            ],
        },
        source: {
            surface,
            org_id: payload.org_id,
            actor_user_id: payload.actor_user_id,
            module: "web/lib/agent/v1/",
        },
        created_at: createdAt,
        raw_payload: payload,
        correlation_id: payload.correlation_id,
        request_id: payload.request_id,
    };
}
