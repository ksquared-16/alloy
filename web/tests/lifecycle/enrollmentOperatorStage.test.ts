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

    it("metadata override wins over canonical", () => {
        expect(
            effectiveEnrollmentOperatorStage("contacted", { enrollment_operator_stage: "lead" }).stage
        ).toBe("lead");
        expect(
            effectiveEnrollmentOperatorStage("contacted", { enrollment_operator_stage: "lead" }).source
        ).toBe("metadata");
    });

    it("unassigned metadata clears stage bucket", () => {
        expect(
            effectiveEnrollmentOperatorStage("contacted", {
                enrollment_operator_stage: ENROLLMENT_OPERATOR_STAGE_UNASSIGNED,
            }).stage
        ).toBeNull();
    });

    it("mergeEnrollmentOperatorStageMetadata sets and clears key", () => {
        expect(mergeEnrollmentOperatorStageMetadata({}, "tour").enrollment_operator_stage).toBe("tour");
        expect(mergeEnrollmentOperatorStageMetadata({ enrollment_operator_stage: "lead" }, null)).not.toHaveProperty(
            "enrollment_operator_stage"
        );
    });

    it("canonicalOperatorStageForStatusKey maps waitlist", () => {
        expect(canonicalOperatorStageForStatusKey("waitlisted")).toBe("waitlist");
    });
});
