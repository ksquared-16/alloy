/**
 * Shared service errors for childcare operational enrollment.
 */

export type OperationalEnrollmentServiceErrorCode =
    | "not_found"
    | "conflict"
    | "invalid_input"
    | "invalid_state"
    | "validation_failed"
    | "db_error";

export class OperationalEnrollmentServiceError extends Error {
    readonly code: OperationalEnrollmentServiceErrorCode;
    readonly details?: Record<string, unknown>;

    constructor(
        code: OperationalEnrollmentServiceErrorCode,
        message: string,
        details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "OperationalEnrollmentServiceError";
        this.code = code;
        this.details = details;
    }
}

export function trimOrNull(value: unknown): string | null {
    const s = value != null ? String(value).trim() : "";
    return s || null;
}
