import { describe, expect, it } from "vitest";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { operationalEnrollmentErrorResponse } from "@/lib/childcareOperational/operationalEnrollmentApi";

describe("operationalEnrollmentApi helpers", () => {
    it("maps service error codes to HTTP statuses", () => {
        const notFound = operationalEnrollmentErrorResponse(
            new OperationalEnrollmentServiceError("not_found", "missing")
        );
        expect(notFound.status).toBe(404);

        const conflict = operationalEnrollmentErrorResponse(
            new OperationalEnrollmentServiceError("conflict", "dup")
        );
        expect(conflict.status).toBe(409);

        const validation = operationalEnrollmentErrorResponse(
            new OperationalEnrollmentServiceError("validation_failed", "bad date")
        );
        expect(validation.status).toBe(400);

        const db = operationalEnrollmentErrorResponse(
            new OperationalEnrollmentServiceError("db_error", "db down")
        );
        expect(db.status).toBe(500);
    });
});
