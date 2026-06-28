/**
 * Standard Alloy API response envelope + helpers.
 *
 * Success: `{ ok: true, data, correlation_id }`
 * Failure: `{ ok: false, error: { code, message, details? }, correlation_id }`
 *
 * Rules enforced by these helpers:
 * - Responses are always JSON objects — never a bare string body.
 * - A correlation id is always present (body + `x-correlation-id` header).
 * - Failures never leak stack traces (details are sanitized).
 * - HTTP status is consistent with the error code unless explicitly overridden.
 *
 * Migration status and conventions: see docs/api/api-response-contract.md.
 */

import { NextResponse } from "next/server";
import {
    CORRELATION_ID_HEADER,
    resolveCorrelationId,
    type CorrelationIdSource,
} from "@/lib/api/correlationId";
import {
    defaultStatusForCode,
    sanitizeErrorDetails,
    toValidationDetails,
    type ApiErrorCode,
} from "@/lib/api/apiErrors";

export type ApiSuccess<T> = {
    ok: true;
    data: T;
    correlation_id?: string;
};

export type ApiFailure = {
    ok: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
    correlation_id?: string;
};

export type ApiResponseBody<T> = ApiSuccess<T> | ApiFailure;

/** Shared init for the response helpers. */
export type ApiResponseInit = {
    /** Explicit correlation id (highest precedence). */
    correlationId?: string | null;
    /** Incoming request/headers to propagate an upstream correlation id from. */
    request?: CorrelationIdSource;
    /** Extra response headers to merge. */
    headers?: HeadersInit;
};

function withCorrelationHeader(res: NextResponse, correlationId: string): NextResponse {
    res.headers.set(CORRELATION_ID_HEADER, correlationId);
    return res;
}

/** Build a success envelope. Defaults to HTTP 200. */
export function apiOk<T>(data: T, init?: ApiResponseInit & { status?: number }): NextResponse {
    const correlation_id = resolveCorrelationId(init?.request, init?.correlationId);
    const body: ApiSuccess<T> = { ok: true, data, correlation_id };
    const res = NextResponse.json(body, { status: init?.status ?? 200, headers: init?.headers });
    return withCorrelationHeader(res, correlation_id);
}

/** Build a failure envelope. Status defaults from the error code when omitted. */
export function apiError(
    code: ApiErrorCode,
    message: string,
    status?: number,
    details?: unknown,
    init?: ApiResponseInit
): NextResponse {
    const correlation_id = resolveCorrelationId(init?.request, init?.correlationId);
    const safeDetails = sanitizeErrorDetails(details);
    const body: ApiFailure = {
        ok: false,
        error: {
            code: String(code),
            message,
            ...(safeDetails !== undefined ? { details: safeDetails } : {}),
        },
        correlation_id,
    };
    const res = NextResponse.json(body, {
        status: status ?? defaultStatusForCode(String(code)),
        headers: init?.headers,
    });
    return withCorrelationHeader(res, correlation_id);
}

/**
 * Build a validation-failure envelope from a ZodError-like value (or any thrown
 * value). Uses the stable `VALIDATION_ERROR` code and includes flattened issues
 * as `details` when available.
 */
export function apiZodError(error: unknown, init?: ApiResponseInit & { message?: string }): NextResponse {
    const details = toValidationDetails(error);
    return apiError("VALIDATION_ERROR", init?.message ?? "Validation failed", undefined, details, init);
}
