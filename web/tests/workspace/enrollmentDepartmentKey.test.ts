import { describe, expect, it } from "vitest";
import { ACCESS_VALIDATION_ENROLLMENT_DEPT_KEY, isEnrollmentLikeDepartmentKey } from "@/lib/workspace/enrollmentDepartmentKey";

describe("isEnrollmentLikeDepartmentKey", () => {
    it("matches canonical enrollment", () => {
        expect(isEnrollmentLikeDepartmentKey("enrollment")).toBe(true);
        expect(isEnrollmentLikeDepartmentKey("Enrollment")).toBe(true);
    });

    it("matches access-validation seed dept key", () => {
        expect(isEnrollmentLikeDepartmentKey(ACCESS_VALIDATION_ENROLLMENT_DEPT_KEY)).toBe(true);
    });

    it("rejects other departments", () => {
        expect(isEnrollmentLikeDepartmentKey("billing")).toBe(false);
        expect(isEnrollmentLikeDepartmentKey("access_val_dept_billing_operations")).toBe(false);
    });
});
