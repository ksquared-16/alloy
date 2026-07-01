import type { BosProposalEnvelopeV1 } from "@/lib/bos/bosProposalEnvelope";
import { BOS_PROPOSAL_ENVELOPE_VERSION } from "@/lib/bos/bosProposalEnvelope";
import { getBosCapabilityDefinition } from "@/lib/bos/bosCapabilityRegistry";
import type { WorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import { WORKFLOW_ASSIST_AGENT_KEY } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";

export type WorkflowAssistToBosEnvelopeOptions = {
    status?: BosProposalEnvelopeV1["status"];
    source_surface?: string;
};

export function workflowAssistSuggestionToBosProposalEnvelope(
    suggestion: WorkflowAssistSuggestionV1,
    options: WorkflowAssistToBosEnvelopeOptions = {}
): BosProposalEnvelopeV1 {
    const def = getBosCapabilityDefinition("workflow_assist");
    const surface = options.source_surface ?? "command_surface";
    const reasoningWarnings = suggestion.reasoning?.warnings ?? [];
    const duplicateWarnings = suggestion.duplicate_warning?.matches?.length
        ? [`duplicate_workflows: ${suggestion.duplicate_warning.matches.length} possible match(es)`]
        : [];

    const diffRows =
        suggestion.edit_review?.map((row) => ({
            field: row.field,
            label: row.label,
            current: row.current,
            proposed: row.proposed,
        })) ?? [];

    return {
        version: BOS_PROPOSAL_ENVELOPE_VERSION,
        proposal_id: suggestion.suggestion_id,
        capability_key: "workflow_assist",
        agent_key: suggestion.agent_key ?? WORKFLOW_ASSIST_AGENT_KEY,
        domain: def.domain,
        status: options.status ?? "draft",
        risk_level: def.default_risk_level,
        requires_approval: suggestion.approval_required,
        summary: suggestion.reasoning.summary,
        affected_surfaces: [
            surface,
            suggestion.target_workflow_id ? `workflow:${suggestion.target_workflow_id}` : "workflow:new",
        ],
        validation: {
            ok: true,
            errors: [],
            warnings: [...reasoningWarnings, ...duplicateWarnings],
        },
        warnings: [...reasoningWarnings, ...duplicateWarnings].map((message) => ({
            message,
            severity: "warning" as const,
        })),
        diff: {
            summary_lines: [`proposal_kind: ${suggestion.proposal_kind}`],
            rows: diffRows.length > 0 ? diffRows : undefined,
        },
        source: {
            surface,
            org_id: suggestion.org_id,
            actor_user_id: suggestion.actor_user_id,
            module: "web/lib/agent/workflowAssist/",
        },
        created_at: suggestion.generated_at_iso,
        raw_payload: suggestion,
    };
}
