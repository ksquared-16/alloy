import { describe, expect, it } from "vitest";
import { formatOpportunityActivityTimelineEvent } from "@/lib/admin/opportunityActivityTimelineFormat";
import { buildOpportunityIntakeSourceViewModel } from "@/lib/forms/opportunityIntakeSourcePresentation";

describe("opportunityIntakeSourcePresentation", () => {
    it("builds auto-operationalized enrollment lead source view", () => {
        const vm = buildOpportunityIntakeSourceViewModel({
            submission_id: "sub-1",
            form_definition_id: "form-1",
            form_name: "Enrollment Lead — Demo",
            submitted_at: "2026-05-28T12:00:00.000Z",
            status: "submitted",
            payload: {
                values: { guardian_full_name: "Jordan Test" },
                meta: { intake_auto_operationalized: true, intake_needs_review: false },
            },
        });
        expect(vm?.sourceLine).toContain("Enrollment Lead — Demo");
        expect(vm?.nextStepLine).toContain("Continue enrollment");
        expect(vm?.autoOperationalized).toBe(true);
    });
});

describe("form intake activity timeline labels", () => {
    it("labels form_submitted with enrollment-friendly detail", () => {
        const act = formatOpportunityActivityTimelineEvent({
            event_type: "form_submitted",
            payload: { intake_auto_operationalized: true },
        });
        expect(act.title).toBe("Enrollment form submitted");
        expect(act.detail).toContain("pipeline");
    });

    it("labels intake_case_operationalized", () => {
        const act = formatOpportunityActivityTimelineEvent({
            event_type: "intake_case_operationalized",
            payload: {},
        });
        expect(act.title).toBe("Lead ready in pipeline");
        expect(act.detail?.toLowerCase()).toContain("continue enrollment");
    });
});
