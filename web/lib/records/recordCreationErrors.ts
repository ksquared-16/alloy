/**
 * Shared service errors for Records record-creation commands.
 *
 * Deliberately the same shape as `EmploymentServiceError` so Add Child and Add
 * Staff map to HTTP identically — one error contract for the whole family of
 * canonical record-creation capabilities.
 */

export type RecordCreationErrorCode =
    | "not_found"
    | "conflict"
    | "invalid_input"
    | "invalid_state"
    | "db_error";

export class RecordCreationError extends Error {
    readonly code: RecordCreationErrorCode;
    readonly details?: Record<string, unknown>;

    constructor(code: RecordCreationErrorCode, message: string, details?: Record<string, unknown>) {
        super(message);
        this.name = "RecordCreationError";
        this.code = code;
        this.details = details;
    }
}

export function recordCreationErrorStatus(code: RecordCreationErrorCode): number {
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
