import { describe, expect, it } from "vitest";

import {
    extractRecipientGreetingFirstName,
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
    child_profiles: [],
    activity_summary: null,
    last_activity_at: null,
    recipient_candidates: [],
};

const contextWithSarah: TaskAssistOpportunityContextV1 = {
    ...baseContext,
    recipient_candidates: [
        {
            person_id: "p1",
            display_label: "Sarah Mitchell (Primary)",
            has_sms: true,
            has_email: true,
        },
    ],
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

    it("fixes grammar for interested in schedule a tour before formatting", () => {
        expect(normalizeTaskAssistMessageGoal("interested in schedule a tour")).toContain("interested in scheduling");
    });

    it("formats tour interest follow-up with greeting from first recipient", () => {
        const body = formatTaskAssistDraftOpening({
            instruction: "Confirm they're still interested in schedule a tour.",
            channel: "sms",
            context: contextWithSarah,
        });
        expect(body).toBe(
            "Hi Sarah, just checking in to see if you're still interested in scheduling a tour. We'd be happy to help with next steps."
        );
    });

    it("extracts greeting first name from recipient display_label", () => {
        expect(extractRecipientGreetingFirstName(contextWithSarah)).toBe("Sarah");
        expect(extractRecipientGreetingFirstName(baseContext)).toBeNull();
    });
});
