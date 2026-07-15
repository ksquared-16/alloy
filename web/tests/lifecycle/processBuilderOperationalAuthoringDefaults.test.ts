import { describe, expect, it } from "vitest";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { operatingPlanSeedDecision } from "@/lib/lifecycle/persistStageOperatingPlanV1";
import { STAGE_OPERATING_PLAN_METADATA_KEY } from "@/lib/lifecycle/stageOperatingPlanV1";

describe("canonical enrollment operating-plan defaults", () => {
    it("Lead default is Direct Action Contact Family", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        const primary = plan.work_templates.find((row) => row.primary);
        expect(primary?.template_key).toBe("contact_family");
        expect(primary?.execution_mode).toBe("direct_action");
        expect(primary?.primary_action?.action_ref).toBe("quick_message");
        expect(plan.outgoing_transitions?.some((row) => row.target_stage_key === "tour")).toBe(true);
        expect(plan.outgoing_transitions?.some((row) => row.target_stage_key === "closed_lost")).toBe(true);
    });

    it("Tour default is Outcome Led Conduct Tour without Primary Action", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("tour")!;
        const primary = plan.work_templates.find((row) => row.primary);
        expect(primary?.template_key).toBe("conduct_tour");
        expect(primary?.execution_mode).toBe("outcome_led");
        expect(primary?.primary_action).toBeUndefined();
        expect(plan.outcomes.map((row) => row.outcome_key)).toEqual(
            expect.arrayContaining([
                "tour_scheduled",
                "tour_completed",
                "no_show",
                "needs_follow_up",
                "family_declined",
                "no_availability",
            ]),
        );
    });

    it("Decision default is Outcome Led with Family Enrolling transition", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("decision")!;
        const primary = plan.work_templates.find((row) => row.primary);
        expect(primary?.template_key).toBe("support_enrollment_decision");
        expect(primary?.execution_mode).toBe("outcome_led");
        expect(plan.outcomes.some((row) => row.outcome_key === "family_enrolling")).toBe(true);
        expect(
            plan.outcome_rules.some(
                (rule) =>
                    rule.when_outcome_key === "family_enrolling"
                    && rule.targets.some((target) => target.transition_ref === "decision_to_enrolling"),
            ),
        ).toBe(true);
    });

    it("Enrolling has Send Enrollment Packet stage-entry work", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("enrolling")!;
        const primary = plan.work_templates.find((row) => row.primary);
        expect(primary?.template_key).toBe("send_enrollment_packet");
        expect(primary?.execution_mode).toBe("direct_action");
        expect(primary?.primary_action?.action_ref).toBe("send_form");
        expect(primary?.required).toBe(true);
    });

    it("does not destructively overwrite preserved tenant-authored plans", () => {
        const custom = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        custom.purpose = "Tenant customized Lead plan";
        const decision = operatingPlanSeedDecision(
            "lead",
            { [STAGE_OPERATING_PLAN_METADATA_KEY]: custom },
            "enrollment",
        );
        expect(decision.action).toBe("preserve");
        expect(decision.plan?.purpose).toBe("Tenant customized Lead plan");
    });
});
