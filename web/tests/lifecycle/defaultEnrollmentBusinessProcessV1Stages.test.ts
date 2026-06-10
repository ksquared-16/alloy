import { describe, expect, it } from "vitest";
import {
    ENROLLMENT_BUSINESS_PROCESS_V1_STAGE_SPECS,
    defaultEnrollmentBusinessProcessV1Stages,
} from "@/lib/lifecycle/defaultEnrollmentBusinessProcessV1Stages";
import { defaultQueueMembershipForEnrollmentStage } from "@/lib/lifecycle/queueMembershipV1";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";

describe("Enrollment Business Process V1 stages", () => {
    it("defines thirteen family and child journey stages", () => {
        expect(ENROLLMENT_BUSINESS_PROCESS_V1_STAGE_SPECS).toHaveLength(13);
        expect(ENROLLMENT_BUSINESS_PROCESS_V1_STAGE_SPECS.map((s) => s.key)).toEqual([
            "new_lead",
            "contacting",
            "qualification",
            "tour_scheduled",
            "tour_completed",
            "decision_pending",
            "closed_lost",
            "waitlist",
            "offered_spot",
            "enrolling",
            "future_start",
            "enrolled",
            "withdrawn",
        ]);
    });

    it("builder default stages match V1 spec", () => {
        const stages = defaultEnrollmentBusinessProcessV1Stages();
        expect(stages).toHaveLength(13);
        expect(stages[1]?.label).toBe("Contacting");
    });

    it("each V1 stage has queue membership and operating plan defaults", () => {
        for (const spec of ENROLLMENT_BUSINESS_PROCESS_V1_STAGE_SPECS) {
            expect(defaultQueueMembershipForEnrollmentStage(spec.key)).not.toBeNull();
            expect(defaultStageOperatingPlanForEnrollmentStage(spec.key)).not.toBeNull();
        }
    });

    it("contacting stage exposes contact attempt outcomes", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("contacting")!;
        expect(plan.work_templates.some((w) => w.label.includes("Contact attempt"))).toBe(true);
        expect(plan.outcomes.some((o) => o.outcome_key === "reached_family")).toBe(true);
        expect(plan.outcomes.some((o) => o.outcome_key === "bad_number")).toBe(true);
    });
});
