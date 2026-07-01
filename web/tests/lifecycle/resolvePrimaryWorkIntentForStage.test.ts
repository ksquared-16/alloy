import { describe, expect, it } from "vitest";
import {
    buildLifecycleIntentIdempotencyKey,
    resolvePrimaryWorkIntentForStage,
} from "@/lib/lifecycle/resolvePrimaryWorkIntentForStage";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";

describe("resolvePrimaryWorkIntentForStage", () => {
    it("maps lead to Make Contact / contact_family when no operating plan", () => {
        expect(resolvePrimaryWorkIntentForStage("lead")).toMatchObject({
            work_intent_key: "make_contact",
            label: "Make Contact",
            work_definition_key: "contact_family",
            provenance: "legacy_stage_map",
        });
    });

    it("maps qualification to Gather Enrollment Information", () => {
        expect(resolvePrimaryWorkIntentForStage("qualification")).toMatchObject({
            work_intent_key: "gather_enrollment_information",
            label: "Gather Enrollment Information",
            work_definition_key: "collect_missing_information",
        });
    });

    it("maps enrolling to Complete Enrollment", () => {
        expect(resolvePrimaryWorkIntentForStage("enrolling")).toMatchObject({
            work_intent_key: "complete_enrollment",
            work_definition_key: "collect_missing_information",
        });
    });

    it("returns null for enrolled when no operating plan", () => {
        expect(resolvePrimaryWorkIntentForStage("enrolled")).toBeNull();
    });

    it("returns null when operating plan has empty work_templates", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("tour_scheduled");
        expect(plan?.work_templates).toEqual([]);
        expect(resolvePrimaryWorkIntentForStage("tour_scheduled", plan)).toBeNull();
    });

    it("returns null when operating plan has empty work_templates for terminal stages", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("enrolled");
        expect(resolvePrimaryWorkIntentForStage("enrolled", plan)).toBeNull();
    });

    it("resolves primary work from configured operating plan templates", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("tour_completed");
        expect(resolvePrimaryWorkIntentForStage("tour_completed", plan)).toMatchObject({
            work_intent_key: "record_tour_outcome_work",
            work_definition_key: "record_tour_outcome",
            provenance: "operating_plan",
        });
    });

    it("resolves decision_pending work only from operating plan config", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("decision_pending");
        expect(resolvePrimaryWorkIntentForStage("decision_pending", plan)).toMatchObject({
            work_intent_key: "follow_up_decision",
            provenance: "operating_plan",
        });
        expect(resolvePrimaryWorkIntentForStage("decision_pending")).toBeNull();
    });

    it("builds stable lifecycle intent idempotency keys", () => {
        expect(
            buildLifecycleIntentIdempotencyKey({
                orgId: "org-1",
                opportunityId: "opp-1",
                stageKey: "lead",
                workIntentKey: "make_contact",
            }),
        ).toBe("lifecycle_intent:org-1:opp-1:lead:make_contact");
    });
});
