import { describe, expect, it } from "vitest";

import { configurationProposalToBosProposalEnvelope } from "@/lib/bos/adapters/configurationProposalToBosProposalEnvelope";
import { needsAttentionSuggestionToBosProposalEnvelope } from "@/lib/bos/adapters/needsAttentionToBosProposalEnvelope";
import { taskAssistSuggestionToBosProposalEnvelope } from "@/lib/bos/adapters/taskAssistToBosProposalEnvelope";
import { workflowAssistSuggestionToBosProposalEnvelope } from "@/lib/bos/adapters/workflowAssistToBosProposalEnvelope";
import { TASK_ASSIST_AGENT_KEY, type TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import { WORKFLOW_ASSIST_AGENT_KEY, type WorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import { CONFIGURATION_PROPOSAL_VERSION } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import { CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { NEEDS_ATTENTION_SUGGESTION_AGENT_KEY } from "@/lib/agent/needsAttentionSuggestion/types";
import { getBosCapabilityDefinition } from "@/lib/bos/bosCapabilityRegistry";

function minimalTaskAssistSuggestion(): TaskAssistSuggestionV1 {
    return {
        version: 1,
        agent_key: TASK_ASSIST_AGENT_KEY,
        suggestion_id: "sug_task_1",
        generated_at_iso: "2026-05-18T12:00:00.000Z",
        org_id: "org-1",
        actor_user_id: "user-1",
        source_surface: "command_surface",
        task_type: "draft_sms",
        entity_type: "opportunities",
        entity_id: "opp-1",
        context_summary: "Follow up on tour",
        recipient_candidates: [],
        selected_recipient: null,
        channel: "sms",
        draft_subject: null,
        draft_body: "Hello",
        scheduled_for_iso: null,
        reminder_due_at_iso: null,
        assumptions: [],
        missing_inputs: [],
        warnings: ["advisory"],
        validation_errors: [],
        confidence: { mode: "deterministic" },
        approval_required: true,
        apply_intent: { kind: "send_communication_now" },
    };
}

function minimalWorkflowAssistSuggestion(): WorkflowAssistSuggestionV1 {
    return {
        version: 1,
        agent_key: WORKFLOW_ASSIST_AGENT_KEY,
        suggestion_id: "sug_wf_1",
        org_id: "org-1",
        actor_user_id: "user-1",
        generated_at_iso: "2026-05-18T12:00:00.000Z",
        proposal_kind: "create_workflow",
        target_workflow_id: null,
        draft_row: {
            name: "Tour reminder",
            event_type: "opportunity_created",
            entity_type: "opportunities",
            enabled: false,
        },
        patch: null,
        reasoning: { summary: "Create tour reminder workflow", warnings: [] },
        approval_required: true,
    };
}

function minimalConfigurationProposal(): ConfigurationProposalV1 {
    return {
        version: CONFIGURATION_PROPOSAL_VERSION,
        id: "prop_cfg_1",
        category: "field",
        intent: "expose_field",
        summary: "Expose field on drawer",
        rationale: ["Operator requested visibility"],
        impacted_entities: ["opportunity"],
        warnings: [],
        risk_level: "low",
        requires_approval: true,
        permission_requirements: ["config_assist.apply"],
        proposed_operations: [],
        apply_mode: "single_operation",
        generated_by: CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY,
        created_at: "2026-05-18T12:00:00.000Z",
    };
}

function minimalAttentionSuggestion(): AttentionSuggestionV1 {
    return {
        version: 1,
        agent_key: NEEDS_ATTENTION_SUGGESTION_AGENT_KEY,
        suggestion_id: "sug_attn_1",
        target: { entity_type: "opportunities", entity_id: "opp-1" },
        source: {
            resolver: "opportunity_attention",
            resolver_version: 2,
            primary_reason_code: "follow_up_date_passed",
            reason_codes: ["follow_up_date_passed"],
        },
        next_action: {
            key: "follow_up",
            label: "Follow up",
            action_family: "follow_up",
            confidence: "deterministic",
        },
        reasoning: { summary: "Follow-up date passed", factors: [] },
        generated_at_iso: "2026-05-18T12:00:00.000Z",
    };
}

describe("bos proposal envelope adapters", () => {
    it("task assist adapter preserves raw_payload", () => {
        const native = minimalTaskAssistSuggestion();
        const envelope = taskAssistSuggestionToBosProposalEnvelope(native);
        expect(envelope.capability_key).toBe("task_assist");
        expect(envelope.agent_key).toBe(TASK_ASSIST_AGENT_KEY);
        expect(envelope.raw_payload).toBe(native);
        expect(envelope.requires_approval).toBe(true);
        expect(envelope.proposal_id).toBe(native.suggestion_id);
    });

    it("workflow assist adapter preserves raw_payload", () => {
        const native = minimalWorkflowAssistSuggestion();
        const envelope = workflowAssistSuggestionToBosProposalEnvelope(native);
        expect(envelope.capability_key).toBe("workflow_assist");
        expect(envelope.raw_payload).toBe(native);
        expect(envelope.domain).toBe("config");
    });

    it("configuration proposal adapter preserves raw_payload and maps lifecycle", () => {
        const native = minimalConfigurationProposal();
        const envelope = configurationProposalToBosProposalEnvelope(native, {
            org_id: "org-1",
            lifecycle_state: "approved",
        });
        expect(envelope.capability_key).toBe("config_layout_assist");
        expect(envelope.raw_payload).toBe(native);
        expect(envelope.status).toBe("approved");
        expect(envelope.risk_level).toBe("low");
    });

    it("needs attention adapter preserves raw_payload and does not imply apply", () => {
        const native = minimalAttentionSuggestion();
        const envelope = needsAttentionSuggestionToBosProposalEnvelope(native, { org_id: "org-1" });
        expect(envelope.raw_payload).toBe(native);
        expect(envelope.requires_approval).toBe(false);
        expect(getBosCapabilityDefinition("needs_attention_suggestion").apply_policy).toBe("none");
    });

    it("adapters do not mutate native payloads", () => {
        const native = minimalTaskAssistSuggestion();
        const before = JSON.stringify(native);
        taskAssistSuggestionToBosProposalEnvelope(native);
        expect(JSON.stringify(native)).toBe(before);
    });
});
