import { describe, expect, it } from "vitest";

import {
    BOS_AUDITED_CAPABILITY_KEYS,
    BOS_CAPABILITY_REGISTRY,
    getBosCapabilityDefinition,
} from "@/lib/bos/bosCapabilityRegistry";
import {
    BOS_CAPABILITIES_WITH_PROPOSAL_ADAPTERS,
    BOS_CAPABILITIES_WITHOUT_PROPOSAL_ADAPTERS,
} from "@/lib/bos/bosAdapterCatalog";
import { agentV0QueueDefinitionToBosProposalEnvelope } from "@/lib/bos/adapters/agentV0QueueDefinitionToBosProposalEnvelope";
import { agentV1RecordOverviewLayoutToBosProposalEnvelope } from "@/lib/bos/adapters/agentV1RecordOverviewLayoutToBosProposalEnvelope";
import { agentV2FieldVisibilityToBosProposalEnvelope } from "@/lib/bos/adapters/agentV2FieldVisibilityToBosProposalEnvelope";
import { configurationProposalToBosProposalEnvelope } from "@/lib/bos/adapters/configurationProposalToBosProposalEnvelope";
import { taskAssistSuggestionToBosProposalEnvelope } from "@/lib/bos/adapters/taskAssistToBosProposalEnvelope";
import { workflowAssistSuggestionToBosProposalEnvelope } from "@/lib/bos/adapters/workflowAssistToBosProposalEnvelope";
import { appendActionCardTurnWithBosMetadata } from "@/lib/bos/commandSurfaceBosWire";
import { buildBosEnvelopeForCommandSurfaceCard } from "@/lib/bos/bosCommandSurfaceEnvelope";
import { createEmptyThreadState } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadState";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";
import { WORKFLOW_ASSIST_AGENT_KEY } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import { CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY, CONFIGURATION_PROPOSAL_VERSION } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import {
    AI_ENRICHMENT_USE_PERMISSION_KEY,
    bosCapabilityUsesEnrichmentPortalProposeGate,
    getBosCapabilityAccessHints,
    resolveAiEnrichmentPortalAccess,
} from "@/lib/bos/auth";
import { canBosProposalApply } from "@/lib/bos/bosProposalLifecycle";

describe("BOS foundation readiness", () => {
    it("registry covers all audited capability keys with no extras", () => {
        const registryKeys = BOS_CAPABILITY_REGISTRY.map((d) => d.capability_key).sort();
        expect(registryKeys).toEqual([...BOS_AUDITED_CAPABILITY_KEYS].sort());
    });

    it("adapter catalog partitions registry (with + without adapters)", () => {
        const withAdapters = [...BOS_CAPABILITIES_WITH_PROPOSAL_ADAPTERS].sort();
        const without = [...BOS_CAPABILITIES_WITHOUT_PROPOSAL_ADAPTERS].sort();
        expect(withAdapters.length + without.length).toBe(BOS_AUDITED_CAPABILITY_KEYS.length);
        for (const key of BOS_AUDITED_CAPABILITY_KEYS) {
            expect(withAdapters.includes(key) || without.includes(key)).toBe(true);
        }
    });

    it("legacy config commit adapters preserve raw_payload", () => {
        const v0 = {
            proposal_id: "p0",
            org_id: "org-1",
            actor_user_id: "u1",
            intent_id: "i0",
            intent_version: 1,
            intent_type: "update_queue_definition" as const,
            slots: {
                work_unit_id: "wu-1",
                queue_definition: {},
                expected_queue_definition_version: 1,
            },
        };
        const e0 = agentV0QueueDefinitionToBosProposalEnvelope(v0);
        expect(e0.raw_payload).toBe(v0);
        expect(e0.capability_key).toBe("agent_v0_queue_definition");

        const v1 = {
            proposal_id: "p1",
            org_id: "org-1",
            actor_user_id: "u1",
            intent_id: "i1",
            intent_version: 1,
            intent_type: "update_record_layout" as const,
            slots: {
                target_kind: "record_overview_layout" as const,
                entity_type: "job" as const,
                surface: "overview" as const,
                config: {},
                expected_config_version: 2,
            },
        };
        expect(agentV1RecordOverviewLayoutToBosProposalEnvelope(v1).raw_payload).toBe(v1);

        const v2 = {
            proposal_id: "p2",
            org_id: "org-1",
            actor_user_id: "u1",
            intent_id: "i2",
            intent_version: 1,
            intent_type: "update_field_visibility" as const,
            slots: {
                target_kind: "field_definition_visibility" as const,
                field_definition_id: "fd-1",
                expected_updated_at: "2026-05-18T00:00:00Z",
                visibility_patch: {},
            },
        };
        expect(agentV2FieldVisibilityToBosProposalEnvelope(v2).raw_payload).toBe(v2);
    });

    it("command surface wire attaches envelope without altering native card payload", () => {
        const suggestion = {
            version: 1 as const,
            agent_key: WORKFLOW_ASSIST_AGENT_KEY,
            suggestion_id: "wf-1",
            org_id: "org-1",
            actor_user_id: "u1",
            generated_at_iso: "2026-05-18T12:00:00.000Z",
            proposal_kind: "create_workflow" as const,
            target_workflow_id: null,
            draft_row: null,
            patch: null,
            reasoning: { summary: "Create workflow", warnings: [] },
            approval_required: true as const,
        };
        const card = { type: "workflow_assist_proposal" as const, suggestion };
        const envelope = buildBosEnvelopeForCommandSurfaceCard(card);
        expect(envelope?.raw_payload).toBe(suggestion);

        const state = appendActionCardTurnWithBosMetadata(createEmptyThreadState(), card);
        const turn = state.turns[0];
        expect(turn.kind).toBe("action_card");
        if (turn.kind === "action_card" && turn.card.type === "workflow_assist_proposal") {
            expect(turn.card.suggestion).toBe(suggestion);
            expect(turn.bos_envelope?.raw_payload).toBe(suggestion);
            expect(turn.card.capability_key).toBe("workflow_assist");
        }
    });

    it("auth barrel exports enrichment portal helper unchanged", () => {
        expect(AI_ENRICHMENT_USE_PERMISSION_KEY).toBe("ai.enrichment.use");
        expect(typeof resolveAiEnrichmentPortalAccess).toBe("function");
        const hints = getBosCapabilityAccessHints("task_assist");
        expect(hints.org_policy_features).toContain("task_assist_draft");
        expect(bosCapabilityUsesEnrichmentPortalProposeGate("task_assist")).toBe(true);
        expect(bosCapabilityUsesEnrichmentPortalProposeGate("orchestrator")).toBe(false);
    });

    it("insight capabilities do not imply apply via registry policy", () => {
        const insight = getBosCapabilityDefinition("needs_attention_suggestion");
        expect(insight.apply_policy).toBe("none");
        expect(insight.requires_human_approval).toBe(false);
    });

    it("mutating capabilities require human approval in registry", () => {
        for (const key of BOS_CAPABILITIES_WITH_PROPOSAL_ADAPTERS) {
            const def = getBosCapabilityDefinition(key);
            if (def.apply_policy === "none" || def.apply_policy === "preview_only") continue;
            expect(def.requires_human_approval).toBe(true);
        }
    });

    it("task and workflow adapters preserve raw_payload and keep apply lifecycle separate", () => {
        const taskNative = {
            version: 1 as const,
            agent_key: TASK_ASSIST_AGENT_KEY,
            suggestion_id: "t1",
            generated_at_iso: "2026-05-18T12:00:00.000Z",
            org_id: "org-1",
            actor_user_id: "u1",
            source_surface: "command_surface",
            task_type: "draft_sms" as const,
            entity_type: "opportunities" as const,
            entity_id: "opp-1",
            context_summary: "Hi",
            recipient_candidates: [],
            selected_recipient: null,
            channel: "sms" as const,
            draft_subject: null,
            draft_body: "Hi",
            scheduled_for_iso: null,
            reminder_due_at_iso: null,
            assumptions: [],
            missing_inputs: [],
            warnings: [],
            validation_errors: [],
            confidence: { mode: "deterministic" as const },
            approval_required: true,
            apply_intent: { kind: "send_communication_now" as const },
        };
        const taskEnv = taskAssistSuggestionToBosProposalEnvelope(taskNative);
        expect(taskEnv.raw_payload).toBe(taskNative);
        expect(canBosProposalApply(taskEnv.status)).toBe(false);

        const configNative = {
            version: CONFIGURATION_PROPOSAL_VERSION,
            id: "cfg-1",
            category: "field" as const,
            intent: "expose",
            summary: "Expose field",
            rationale: [],
            impacted_entities: [],
            risk_level: "low" as const,
            requires_approval: true,
            permission_requirements: [],
            proposed_operations: [],
            apply_mode: "single_operation" as const,
            generated_by: CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY,
            created_at: "2026-05-18T12:00:00.000Z",
        };
        const cfgEnv = configurationProposalToBosProposalEnvelope(configNative, { org_id: "org-1" });
        expect(cfgEnv.raw_payload).toBe(configNative);
    });
});
