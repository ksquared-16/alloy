import { describe, expect, it } from "vitest";

import { taskAssistFollowUpNoticeText } from "@/lib/agent/taskAssist/taskAssistCompactActionCard";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

const candidate: TaskAssistEntitySearchCandidate = {
    entity_type: "opportunities",
    entity_id: "opp-1",
    label: "Mitchell household",
    subtitle: null,
    confidence: "high",
    source: "customer_family",
    matched_fields: ["customer.name"],
};

describe("taskAssistFollowUpNoticeText", () => {
    it("uses reminder-only copy for create_reminder", () => {
        const text = taskAssistFollowUpNoticeText(candidate, "North Campus", {
            intent_type: "create_reminder",
            channel_hint: null,
            timing_hint_text: "tomorrow",
            message_goal_text: "Follow up with Mitchell",
            search_text_hint: null,
            confidence: "high",
            warnings: [],
            workflow_blocked: false,
        });
        expect(text).toMatch(/follow-up reminder ready/i);
        expect(text).not.toMatch(/drafted a message/i);
    });

    it("uses schedule-oriented copy for schedule_message", () => {
        const text = taskAssistFollowUpNoticeText(candidate, null, {
            intent_type: "schedule_message",
            channel_hint: "email",
            timing_hint_text: "tomorrow",
            message_goal_text: "Say hi",
            search_text_hint: null,
            confidence: "high",
            warnings: [],
            workflow_blocked: false,
        });
        expect(text).toMatch(/message draft ready/i);
        expect(text).toMatch(/scheduled for|send time|before anything goes out/i);
    });
});
