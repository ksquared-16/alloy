import { describe, expect, it } from "vitest";

import {
    taskAssistDraftProposalSummary,
    taskAssistDraftRecipientContextLabel,
} from "@/lib/adminV2/bos/taskAssistOperationalProposalPresentation";

describe("taskAssistOperationalProposalPresentation", () => {
    it("maps communication_objective instruction to human label", () => {
        const summary = taskAssistDraftProposalSummary("email", "communication_objective:initial_outreach", {
            intent_type: "draft_message",
            channel_hint: "email",
            instruction: "communication_objective:initial_outreach",
            communication_objective: "initial_outreach",
            timing_hint_text: null,
            reminder_title: null,
            reminder_due_hint: null,
        });
        expect(summary).toBe("Email · Initial outreach");
        expect(summary).not.toContain("communication_objective");
    });

    it("formats drafted-for recipient context", () => {
        expect(taskAssistDraftRecipientContextLabel("Sarah Chen")).toBe("Drafted for Sarah Chen");
    });
});
