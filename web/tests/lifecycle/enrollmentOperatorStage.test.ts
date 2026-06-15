import { describe, expect, it } from "vitest";
import {
    canonicalOperatorStageForStatusKey,
    effectiveEnrollmentOperatorStage,
    ENROLLMENT_OPERATOR_STAGE_UNASSIGNED,
    mergeEnrollmentOperatorStageMetadata,
} from "@/lib/lifecycle/enrollmentOperatorStage";

describe("enrollmentOperatorStage", () => {
    it("uses canonical default when metadata absent", () => {
        expect(effectiveEnrollmentOperatorStage("new_inquiry", {}).stage).toBe("lead");
        expect(effectiveEnrollmentOperatorStage("new_inquiry", {}).source).toBe("canonical");
    });

    it("metadata override wins over canonical (legacy read fallback)", () => {
        expect(
            effectiveEnrollmentOperatorStage("contacted", { enrollment_operator_stage: "lead" }).stage
        ).toBe("lead");
        expect(
            effectiveEnrollmentOperatorStage("contacted", { enrollment_operator_stage: "lead" }).source
        ).toBe("metadata");
    });

    it("process_stage_key metadata override wins over canonical", () => {
        expect(effectiveEnrollmentOperatorStage("contacted", { process_stage_key: "lead" }).stage).toBe(
            "lead",
        );
    });

    it("unassigned metadata clears stage bucket", () => {
        expect(
            effectiveEnrollmentOperatorStage("contacted", {
                enrollment_operator_stage: ENROLLMENT_OPERATOR_STAGE_UNASSIGNED,
            }).stage
        ).toBeNull();
    });

    it("mergeEnrollmentOperatorStageMetadata writes process_stage_key", () => {
        expect(mergeEnrollmentOperatorStageMetadata({}, "tour").process_stage_key).toBe("tour");
        expect(mergeEnrollmentOperatorStageMetadata({}, "tour")).not.toHaveProperty("enrollment_operator_stage");
        expect(mergeEnrollmentOperatorStageMetadata({ enrollment_operator_stage: "lead" }, null)).not.toHaveProperty(
            "process_stage_key"
        );
    });

    it("canonicalOperatorStageForStatusKey maps waitlist", () => {
        expect(canonicalOperatorStageForStatusKey("waitlisted")).toBe("waitlist");
    });
});
