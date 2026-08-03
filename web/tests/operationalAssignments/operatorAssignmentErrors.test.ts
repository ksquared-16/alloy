import { describe, expect, it } from "vitest";
import { operatorFacingAssignmentError } from "@/lib/operationalAssignments/operatorAssignmentErrors";

describe("operatorFacingAssignmentError", () => {
    it("never surfaces enrollmentAgreementId", () => {
        const msg = operatorFacingAssignmentError("enrollmentAgreementId is required");
        expect(msg.toLowerCase()).not.toContain("enrollmentagreementid");
        expect(msg).toMatch(/proposed|enroll/i);
    });

    it("translates assignment type field names", () => {
        const msg = operatorFacingAssignmentError("assignment_type_id is required");
        expect(msg.toLowerCase()).not.toContain("assignment_type_id");
        expect(msg).toMatch(/category/i);
    });
});
