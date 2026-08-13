/**
 * Shared service errors for employment. Mirrors
 * OperationalEnrollmentServiceError so route/action error mapping is identical.
 */

export type EmploymentServiceErrorCode =
    | "not_found"
    | "conflict"
    | "invalid_input"
    | "invalid_state"
    | "db_error";

export class EmploymentServiceError extends Error {
    readonly code: EmploymentServiceErrorCode;
    readonly details?: Record<string, unknown>;

    constructor(
        code: EmploymentServiceErrorCode,
        message: string,
        details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "EmploymentServiceError";
        this.code = code;
        this.details = details;
    }
}

/** HTTP status for a service error — one mapping, used by every employment surface. */
export function employmentErrorStatus(code: EmploymentServiceErrorCode): number {
    switch (code) {
        case "not_found":
            return 404;
        case "conflict":
            return 409;
        case "db_error":
            return 500;
        default:
            return 422;
    }
}
