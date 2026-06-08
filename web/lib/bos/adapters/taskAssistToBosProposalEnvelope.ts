import type { BosProposalEnvelopeV1 } from "@/lib/bos/bosProposalEnvelope";
import { BOS_PROPOSAL_ENVELOPE_VERSION } from "@/lib/bos/bosProposalEnvelope";
import { getBosCapabilityDefinition } from "@/lib/bos/bosCapabilityRegistry";
import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";

export type TaskAssistToBosEnvelopeOptions = {
    status?: BosProposalEnvelopeV1["status"];
    source_surface?: string;
};

export function taskAssistSuggestionToBosProposalEnvelope(
    suggestion: TaskAssistSuggestionV1,
    options: TaskAssistToBosEnvelopeOptions = {}
): BosProposalEnvelopeV1 {
    const def = getBosCapabilityDefinition("task_assist");
    const surface = options.source_surface ?? suggestion.source_surface;
    const validationErrors = suggestion.validation_errors ?? [];
    const warnings = suggestion.warnings ?? [];

    return {
        version: BOS_PROPOSAL_ENVELOPE_VERSION,
        proposal_id: suggestion.suggestion_id,
        capability_key: "task_assist",
        agent_key: suggestion.agent_key ?? TASK_ASSIST_AGENT_KEY,
        domain: def.domain,
        status: options.status ?? "draft",
        risk_level: def.default_risk_level,
        requires_approval: suggestion.approval_required,
        summary: suggestion.context_summary,
        affected_surfaces: [surface, `entity:${suggestion.entity_type}:${suggestion.entity_id}`],
        validation: {
            ok: validationErrors.length === 0,
            errors: [...validationErrors],
            warnings: [...warnings, ...suggestion.missing_inputs.map((m) => `missing: ${m}`)],
        },
        warnings: warnings.map((message) => ({ message, severity: "warning" as const })),
        diff: {
            summary_lines: [
                `task_type: ${suggestion.task_type}`,
                `channel: ${suggestion.channel}`,
                suggestion.draft_subject ? `subject: ${suggestion.draft_subject}` : "subject: (none)",
            ],
        },
        source: {
            surface,
            org_id: suggestion.org_id,
            actor_user_id: suggestion.actor_user_id,
            module: "web/lib/agent/taskAssist/",
        },
        created_at: suggestion.generated_at_iso,
        raw_payload: suggestion,
    };
}
