import type { BosProposalEnvelopeV1 } from "@/lib/bos/bosProposalEnvelope";
import { BOS_PROPOSAL_ENVELOPE_VERSION } from "@/lib/bos/bosProposalEnvelope";
import { getBosCapabilityDefinition } from "@/lib/bos/bosCapabilityRegistry";
import { mapConfigLayoutAssistStateToBosStatus } from "@/lib/bos/bosProposalStatusMap";
import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import { CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import type { ConfigLayoutAssistProposalState } from "@/lib/agent/configLayoutAssist/configurationProposalState";
import type { ProposalValidationResultV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";

export type ConfigurationProposalToBosEnvelopeOptions = {
    /** When omitted, envelope status is `draft`. */
    lifecycle_state?: ConfigLayoutAssistProposalState;
    source_surface?: string;
    org_id: string;
    actor_user_id?: string | null;
    validation?: ProposalValidationResultV1 | null;
};

export function configurationProposalToBosProposalEnvelope(
    proposal: ConfigurationProposalV1,
    options: ConfigurationProposalToBosEnvelopeOptions
): BosProposalEnvelopeV1 {
    const def = getBosCapabilityDefinition("config_layout_assist");
    const surface = options.source_surface ?? "command_surface";
    const lifecycleState = options.lifecycle_state ?? "draft";
    const validation = options.validation;
    const proposalWarnings = proposal.warnings ?? [];
    const operationWarnings = proposal.proposed_operations.flatMap((op) => op.warnings ?? []);

    const validationErrors =
        validation?.issues.filter((i) => i.severity === "error").map((i) => i.message) ?? [];
    const validationWarnings =
        validation?.issues.filter((i) => i.severity === "warning").map((i) => i.message) ?? [];

    const affected = new Set<string>([surface, `category:${proposal.category}`]);
    for (const layout of proposal.impacted_layouts ?? []) {
        affected.add(`layout:${layout}`);
    }
    for (const entity of proposal.impacted_entities ?? []) {
        affected.add(`entity:${entity}`);
    }

    return {
        version: BOS_PROPOSAL_ENVELOPE_VERSION,
        proposal_id: proposal.id,
        capability_key: "config_layout_assist",
        agent_key: proposal.generated_by === CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY ? CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY : proposal.generated_by,
        domain: def.domain,
        status: mapConfigLayoutAssistStateToBosStatus(lifecycleState),
        risk_level: proposal.risk_level,
        requires_approval: proposal.requires_approval,
        summary: proposal.summary,
        affected_surfaces: [...affected],
        validation: {
            ok: validation ? validation.ok : validationErrors.length === 0,
            errors: validationErrors,
            warnings: [
                ...validationWarnings,
                ...proposalWarnings.map((w) => w.message),
                ...operationWarnings.map((w) => w.message),
            ],
        },
        warnings: [...proposalWarnings, ...operationWarnings].map((w) => ({
            code: w.code,
            message: w.message,
            severity: w.severity,
        })),
        diff: {
            summary_lines: proposal.rationale.length > 0 ? [...proposal.rationale] : [proposal.intent],
            rows: proposal.proposed_operations.map((op) => ({
                operation_id: op.operation_id,
                kind: op.kind,
                entity_type: op.entity_type,
                field_key: op.field_key,
                section_key: op.section_key,
            })),
        },
        source: {
            surface,
            org_id: options.org_id,
            actor_user_id: options.actor_user_id ?? proposal.created_by ?? null,
            module: "web/lib/agent/configLayoutAssist/",
        },
        created_at: proposal.created_at,
        raw_payload: proposal,
    };
}
