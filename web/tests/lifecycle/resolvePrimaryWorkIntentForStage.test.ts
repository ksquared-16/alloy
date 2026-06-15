import { describe, expect, it } from "vitest";
import {
    buildLifecycleIntentIdempotencyKey,
    resolvePrimaryWorkIntentForStage,
} from "@/lib/lifecycle/resolvePrimaryWorkIntentForStage";

describe("resolvePrimaryWorkIntentForStage", () => {
    it("maps lead to Make Contact / contact_family", () => {
        expect(resolvePrimaryWorkIntentForStage("lead")).toMatchObject({
            work_intent_key: "make_contact",
            label: "Make Contact",
            work_definition_key: "contact_family",
        });
    });

    it("maps qualification to Gather Enrollment Information", () => {
        expect(resolvePrimaryWorkIntentForStage("qualification")).toMatchObject({
            work_intent_key: "gather_enrollment_information",
            label: "Gather Enrollment Information",
            work_definition_key: "collect_missing_information",
        });
    });

    it("maps tour to Complete Tour Process", () => {
        expect(resolvePrimaryWorkIntentForStage("tour")).toMatchObject({
            work_intent_key: "complete_tour_process",
            work_definition_key: "record_tour_outcome",
        });
    });

    it("maps enrolling to Complete Enrollment", () => {
        expect(resolvePrimaryWorkIntentForStage("enrolling")).toMatchObject({
            work_intent_key: "complete_enrollment",
            work_definition_key: "collect_missing_information",
        });
    });

    it("returns null for enrolled", () => {
        expect(resolvePrimaryWorkIntentForStage("enrolled")).toBeNull();
    });

    it("returns null for waitlist and decision", () => {
        expect(resolvePrimaryWorkIntentForStage("waitlist")).toBeNull();
        expect(resolvePrimaryWorkIntentForStage("decision")).toBeNull();
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
