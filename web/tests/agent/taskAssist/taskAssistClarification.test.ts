import { describe, expect, it } from "vitest";

import {
    needsMessageGoalClarification,
    needsReminderWhatClarification,
    needsReminderWhenClarification,
    reminderClarificationKind,
} from "@/lib/agent/taskAssist/taskAssistClarification";
import type { TaskAssistCommandIntent } from "@/lib/agent/taskAssist/taskAssistCommandIntent";

const base: TaskAssistCommandIntent = {
    intent_type: "draft_message",
    channel_hint: null,
    timing_hint_text: null,
    message_goal_text: null,
    search_text_hint: "Mitchell",
    confidence: "medium",
    warnings: [],
    workflow_blocked: false,
};

describe("taskAssistClarification", () => {
    it("requires message goal for comms without goal text", () => {
        expect(needsMessageGoalClarification({ ...base, intent_type: "draft_message" })).toBe(true);
        expect(
            needsMessageGoalClarification({
                ...base,
                intent_type: "draft_message",
                message_goal_text: "Follow up on tour",
            })
        ).toBe(false);
    });

    it("requires reminder what and when for remind about Mitchell", () => {
        const intent: TaskAssistCommandIntent = {
            ...base,
            intent_type: "create_reminder",
            search_text_hint: "Mitchell",
            message_goal_text: null,
            timing_hint_text: null,
        };
        expect(reminderClarificationKind(intent)).toBe("reminder_what");
        expect(needsReminderWhatClarification(intent)).toBe(true);
        expect(needsReminderWhenClarification(intent)).toBe(true);
    });
});
