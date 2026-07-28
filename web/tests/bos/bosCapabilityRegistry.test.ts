import { describe, expect, it } from "vitest";

import {
    BOS_AUDITED_CAPABILITY_KEYS,
    BOS_CAPABILITY_REGISTRY,
    getBosCapabilityByLegacyAgentKey,
    getBosCapabilityDefinition,
} from "@/lib/bos/bosCapabilityRegistry";
import type { BosCapabilityKey } from "@/lib/bos/bosCapability";

const EXPECTED_AUDITED_KEYS: BosCapabilityKey[] = [
    "orchestrator",
    "task_assist",
    "workflow_assist",
    "config_layout_assist",
    "needs_attention_suggestion",
    "attention_enrich",
    "job_overview_layout",
    "agent_v0_queue_definition",
    "agent_v1_record_overview_layout",
    "agent_v2_field_visibility",
    "packet_review_insight",
    "operational_question_future_room_capacity",
    "operational_question_room_utilization",
    "operational_question_room_utilization_fte",
    "operational_question_equivalent_child_count",
];

describe("bosCapabilityRegistry", () => {
    it("contains all Phase 1 audited capabilities", () => {
        expect(BOS_CAPABILITY_REGISTRY.length).toBe(EXPECTED_AUDITED_KEYS.length);
        expect([...BOS_AUDITED_CAPABILITY_KEYS].sort()).toEqual([...EXPECTED_AUDITED_KEYS].sort());
    });

    it("assigns human approval only to mutating capabilities", () => {
        const noApproval: BosCapabilityKey[] = [
            "orchestrator",
            "needs_attention_suggestion",
            "attention_enrich",
            "packet_review_insight",
        ];
        for (const key of noApproval) {
            expect(getBosCapabilityDefinition(key).requires_human_approval).toBe(false);
        }
        expect(getBosCapabilityDefinition("task_assist").requires_human_approval).toBe(true);
        expect(getBosCapabilityDefinition("workflow_assist").requires_human_approval).toBe(true);
        expect(getBosCapabilityDefinition("config_layout_assist").requires_human_approval).toBe(true);
    });

    it("resolves legacy agent_key to capability definition", () => {
        const task = getBosCapabilityByLegacyAgentKey("task_assist");
        expect(task?.capability_key).toBe("task_assist");
        expect(getBosCapabilityByLegacyAgentKey("unknown_agent")).toBeNull();
    });

    it("orchestrator has no apply policy or proposal mode", () => {
        const o = getBosCapabilityDefinition("orchestrator");
        expect(o.proposal_mode).toBe("none");
        expect(o.apply_policy).toBe("none");
    });

    it("packet_review_insight is read-only insight", () => {
        const def = getBosCapabilityDefinition("packet_review_insight");
        expect(def.domain).toBe("insight");
        expect(def.proposal_mode).toBe("ephemeral");
        expect(def.apply_policy).toBe("none");
        expect(def.write_class).toBe("none");
    });
});
