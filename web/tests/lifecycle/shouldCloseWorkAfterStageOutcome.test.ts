import { describe, expect, it } from "vitest";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { shouldCloseWorkAfterStageOutcome } from "@/lib/lifecycle/shouldCloseWorkAfterStageOutcome";

describe("shouldCloseWorkAfterStageOutcome", () => {
    const leadPlan = defaultStageOperatingPlanForEnrollmentStage("lead")!;

    it("closes on successful outcome (qualified)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "qualified")).toEqual({
            shouldClose: true,
            reason: "success",
        });
    });

    it("keeps work open on retry outcome (left_message)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "left_message")).toEqual({
            shouldClose: false,
            reason: "retry",
        });
    });

    it("keeps work open on retry outcome (unable_to_reach below max)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "unable_to_reach")).toEqual({
            shouldClose: false,
            reason: "retry",
        });
    });

    it("keeps work open on retry outcome (awaiting_response)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "awaiting_response")).toEqual({
            shouldClose: false,
            reason: "retry",
        });
    });

    it("closes on terminal non-success (closed_lost → closed case)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "closed_lost")).toEqual({
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
