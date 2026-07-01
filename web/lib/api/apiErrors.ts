/**
 * Stable error codes + default HTTP status mapping for the Alloy API contract.
 *
 * Error codes are stable, machine-readable strings. Clients should branch on
 * `error.code`, not on `message` (which is human-facing and may change). Routes
 * may introduce additional domain-specific codes (any SCREAMING_SNAKE_CASE
 * string is allowed); the constants below are the shared baseline.
 *
 * @see docs/api/api-response-contract.md
 */

export const API_ERROR_CODES = {
    BAD_REQUEST: "BAD_REQUEST",
    VALIDATION_ERROR: "VALIDATION_ERROR",
    UNAUTHORIZED: "UNAUTHORIZED",
    FORBIDDEN: "FORBIDDEN",
    NOT_FOUND: "NOT_FOUND",
    CONFLICT: "CONFLICT",
    RATE_LIMITED: "RATE_LIMITED",
    NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
    INTERNAL: "INTERNAL",
} as const;

/** Baseline error code union; routes may also emit other SCREAMING_SNAKE_CASE codes. */
export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES] | (string & {});

/**
 * Default HTTP status per baseline code. `VALIDATION_ERROR` maps to 400 to match
 * the existing codebase convention (e.g. legacy `zodErrorResponse`) rather than 422.
 */
export const DEFAULT_STATUS_BY_CODE: Record<string, number> = {
    BAD_REQUEST: 400,
    VALIDATION_ERROR: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    NOT_IMPLEMENTED: 501,
    INTERNAL: 500,
};

export function defaultStatusForCode(code: string): number {
    return DEFAULT_STATUS_BY_CODE[code] ?? 400;
}

/**
 * Reduce arbitrary `details` to a safe, serializable form. Never leaks stack
 * traces: an `Error` collapses to its message only. Other values pass through
 * (callers must not place secrets in `details`).
 */
export function sanitizeErrorDetails(details: unknown): unknown {
    if (details === undefined || details === null) return undefined;
    if (details instanceof Error) return { message: details.message };
    return details;
}

/**
 * Best-effort human message for an unknown thrown value, without leaking stack
 * traces. Use in catch blocks before passing to `apiError(...)`.
 */
export function safeErrorMessage(error: unknown, fallback = "Unexpected error"): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error.trim()) return error.trim();
    return fallback;
}

/** Duck-typed extraction of validation details from a ZodError-like value. */
export function toValidationDetails(error: unknown): unknown {
    if (error && typeof error === "object") {
        const maybe = error as { flatten?: () => unknown; issues?: unknown };
        if (typeof maybe.flatten === "function") {
            try {
                return maybe.flatten();
            } catch {
                /* fall through */
            }
        }
        if (Array.isArray(maybe.issues)) return { issues: maybe.issues };
    }
    if (error instanceof Error && error.message) return { message: error.message };
    return undefined;
}
