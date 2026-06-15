import { describe, expect, it } from "vitest";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { shouldCloseWorkAfterStageOutcome } from "@/lib/lifecycle/shouldCloseWorkAfterStageOutcome";

describe("shouldCloseWorkAfterStageOutcome", () => {
    const leadPlan = defaultStageOperatingPlanForEnrollmentStage("lead")!;

    it("closes on successful outcome (reached_family)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "reached_family")).toEqual({
            shouldClose: true,
            reason: "success",
        });
    });

    it("keeps work open on retry outcome (left_voicemail)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "left_voicemail")).toEqual({
            shouldClose: false,
            reason: "retry",
        });
    });

    it("keeps work open on retry outcome (no_answer)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "no_answer")).toEqual({
            shouldClose: false,
            reason: "retry",
        });
    });

    it("keeps work open on retry outcome (sent_text)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "sent_text")).toEqual({
            shouldClose: false,
            reason: "retry",
        });
    });

    it("closes on terminal non-success (not_interested → closed case)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "not_interested")).toEqual({
            shouldClose: true,
            reason: "terminal",
        });
    });

    it("closes on child terminal disposition (enrolled)", () => {
        const enrollingPlan = defaultStageOperatingPlanForEnrollmentStage("enrolling")!;
        expect(shouldCloseWorkAfterStageOutcome(enrollingPlan, "enrollment_complete")).toEqual({
            shouldClose: true,
            reason: "success",
        });
    });
});
