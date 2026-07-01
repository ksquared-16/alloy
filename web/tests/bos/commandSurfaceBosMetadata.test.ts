import { describe, expect, it } from "vitest";

import {
    capabilityKeyForCommandSurfaceCardType,
    withCommandSurfaceCardCapabilityKey,
} from "@/lib/bos/commandSurfaceBosMetadata";

describe("commandSurfaceBosMetadata", () => {
    it("maps card types to capability_key", () => {
        expect(capabilityKeyForCommandSurfaceCardType("task_assist")).toBe("task_assist");
        expect(capabilityKeyForCommandSurfaceCardType("workflow_assist_proposal")).toBe("workflow_assist");
        expect(capabilityKeyForCommandSurfaceCardType("job_layout")).toBe("job_overview_layout");
    });

    it("withCommandSurfaceCardCapabilityKey adds metadata without removing fields", () => {
        const card = withCommandSurfaceCardCapabilityKey({
            type: "workflow_assist_proposal",
            suggestion: {
                version: 1,
                agent_key: "workflow_assist",
                suggestion_id: "x",
                org_id: "o",
                actor_user_id: "u",
                generated_at_iso: "2026-05-18T00:00:00.000Z",
                proposal_kind: "create_workflow",
                target_workflow_id: null,
                draft_row: null,
                patch: null,
                reasoning: { summary: "s", warnings: [] },
                approval_required: true,
            },
        });
        expect(card.capability_key).toBe("workflow_assist");
        expect(card.type).toBe("workflow_assist_proposal");
        expect(card.suggestion.agent_key).toBe("workflow_assist");
    });

    it("preserves existing capability_key on card", () => {
        const card = withCommandSurfaceCardCapabilityKey({
            type: "task_assist",
            capability_key: "task_assist",
            entityId: "e",
            entityLabel: "L",
            bootstrap: { intent_type: "draft_message", channel_hint: "sms" },
            bootstrapKey: "k",
            expanded: false,
            uiPhase: "draft",
        });
        expect(card.capability_key).toBe("task_assist");
    });
});
