import { describe, expect, it } from "vitest";

import {
    formatTaskAssistDraftOpening,
    normalizeTaskAssistMessageGoal,
} from "@/lib/agent/taskAssist/taskAssistDraftMessageNormalize";
import type { TaskAssistOpportunityContextV1 } from "@/lib/agent/taskAssist/taskAssistOpportunityContext";

const baseContext: TaskAssistOpportunityContextV1 = {
    opportunity_id: "opp-1",
    opportunity_label: "Mitchell household",
    status_key: "inquiry",
    status_label: "Inquiry",
    work_unit_id: null,
    customer_id: null,
    household_label: "Mitchell household",
    primary_person_id: null,
    children_summary: null,
    primary_child_display_name: null,
    activity_summary: null,
    last_activity_at: null,
    recipient_candidates: [],
};

describe("taskAssistDraftMessageNormalize", () => {
    it("normalizes her youngest child without a known child name", () => {
        const goal = "we're excited for her youngest child to start";
        expect(normalizeTaskAssistMessageGoal(goal)).toContain("youngest child in your family");
        expect(normalizeTaskAssistMessageGoal(goal)).not.toMatch(/\bher youngest child\b/i);
    });

    it("uses child name when confidently available", () => {
        const goal = "we're excited for her youngest child to start";
        expect(normalizeTaskAssistMessageGoal(goal, { primaryChildName: "Emma" })).toContain("Emma");
    });

    it("formats Mitchell-family excited-to-start SMS warmly", () => {
        const body = formatTaskAssistDraftOpening({
            instruction: "we're excited for her youngest child to start",
            channel: "sms",
            context: baseContext,
        });
        expect(body).toBe("We're excited for the youngest child in your family to start with us soon!");
    });

    it("uses child name in draft when context provides it", () => {
        const body = formatTaskAssistDraftOpening({
            instruction: "we're excited for her youngest child to start",
            channel: "sms",
            context: { ...baseContext, primary_child_display_name: "Emma" },
        });
        expect(body).toBe("We're excited for Emma to start with us soon!");
    });
});
