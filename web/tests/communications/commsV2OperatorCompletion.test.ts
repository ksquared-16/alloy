import { describe, expect, it } from "vitest";
import {
    TRIAGE_OPERATOR_ACTIONS,
    conversationAttentionLabel,
    triageAttentionStateForAction,
    isNeedsReviewConversation,
    RESOLVED_ATTENTION_STATE,
} from "@/lib/communications/v2/conversationTriage";
import { conversationQueueStatusPill, computeCommandCenterMetrics } from "@/lib/communications/v2/commandCenterViewModel";
import { buildPreferenceChange } from "@/lib/communications/v2/preferenceMutations";
import { operatorStatusToPreferenceState } from "@/lib/communications/v2/communicationPreferenceLabels";

describe("conversation triage", () => {
    it("maps operator actions to attention_state values", () => {
        expect(triageAttentionStateForAction("needs_review")).toBeNull();
        expect(triageAttentionStateForAction("needs_response")).toBe("awaiting_parent_reply");
        expect(triageAttentionStateForAction("resolved")).toBe(RESOLVED_ATTENTION_STATE);
        expect(TRIAGE_OPERATOR_ACTIONS).toHaveLength(3);
    });

    it("labels resolved and needs review honestly", () => {
        expect(conversationAttentionLabel(null)).toBe("Needs review");
        expect(conversationAttentionLabel("resolved")).toBe("Resolved");
        expect(conversationAttentionLabel("awaiting_parent_reply")).toBe("Needs response");
    });

    it("updates queue pill and KPI counts after triage states", () => {
        expect(conversationQueueStatusPill({ id: "1", attention_state: "resolved" }).label).toBe("Resolved");
        expect(isNeedsReviewConversation({ attention_state: "resolved" })).toBe(false);
        const metrics = computeCommandCenterMetrics([
            { id: "a", attention_state: null },
            { id: "b", attention_state: "resolved" },
            { id: "c", attention_state: "awaiting_parent_reply" },
        ]);
        expect(metrics.unclassified).toBe(1);
    });
});

describe("preference mutations", () => {
    it("builds upsert + audit event pairs", () => {
        const { upsert, event } = buildPreferenceChange({
            orgId: "org-1",
            personId: "person-1",
            category: "email_transactional",
            fromState: "unset",
            toState: "opted_in",
            source: "admin_command_center",
            method: "operator_edit",
            actorUserId: "user-1",
        });
        expect(upsert.state).toBe("opted_in");
        expect(event.to_state).toBe("opted_in");
        expect(operatorStatusToPreferenceState("Blocked")).toBe("opted_out");
    });
});

describe("family note route contract", () => {
    it("documents in_app channel for internal notes", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const src = readFileSync(join(process.cwd(), "app/api/admin/communications/family-note/route.ts"), "utf8");
        expect(src).toMatch(/channel: "in_app"/);
        expect(src).toMatch(/kind: "note"/);
        expect(src).not.toMatch(/family-send/);
    });
});
