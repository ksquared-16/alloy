/**
 * The one shape an external caller ever sees when something goes wrong.
 *
 * ── WHAT A DEVELOPER GETS, AND WHAT THEY DO NOT ──
 *
 * `code` is stable and machine-readable; branch on it. `type` is a coarse class.
 * `message` is for humans and is explicitly NOT a contract. `request_id` is on
 * every response, success or failure, because it is the one identifier support
 * can trace.
 *
 * Never returned: stack traces, SQL text, exception class names, table or column
 * names, driver errors. An unmapped internal failure becomes `internal_error`
 * with a request id and nothing else — a caller who can read our schema from an
 * error message has been handed a map.
 *
 * ── ENUMERATION ──
 *
 * Every credential and token problem collapses to `invalid_credential`.
 * Distinguishing "no such client" from "wrong secret" from "revoked" tells a
 * prober which half of a guess was right, which is precisely the feedback a
 * credential-stuffing run needs. The AUDIT keeps the distinction; the wire does
 * not.
 */

import { NextResponse } from "next/server";

export type ApiErrorType =
    | "invalid_request"
    | "unauthenticated"
    | "forbidden_scope"
    | "forbidden_resource"
    | "not_found"
    | "conflict"
    | "rate_limited"
    | "internal_error";

export type ApiErrorBody = {
    error: {
        code: string;
        type: ApiErrorType;
        message: string;
        request_id: string;
        details?: Record<string, unknown>;
    };
};

const STATUS_BY_TYPE: Record<ApiErrorType, number> = {
    invalid_request: 400,
    unauthenticated: 401,
    forbidden_scope: 403,
    forbidden_resource: 403,
    not_found: 404,
    conflict: 409,
    rate_limited: 429,
    internal_error: 500,
};

export function apiError(params: {
    code: string;
    type: ApiErrorType;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
    headers?: Record<string, string>;
    status?: number;
}): NextResponse<ApiErrorBody> {
    const body: ApiErrorBody = {
        error: {
            code: params.code,
            type: params.type,
            message: params.message,
            request_id: params.requestId,
            ...(params.details ? { details: params.details } : {}),
        },
    };
    return NextResponse.json(body, {
        status: params.status ?? STATUS_BY_TYPE[params.type],
        headers: { "X-Request-Id": params.requestId, ...(params.headers ?? {}) },
    });
}

/** The single refusal for every credential and token failure. */
export function invalidCredential(requestId: string): NextResponse<ApiErrorBody> {
    return apiError({
        code: "invalid_credential",
        type: "unauthenticated",
        message: "The credential presented is not valid.",
        requestId,
    });
}

export function rateLimited(
    requestId: string,
    retryAfterSeconds: number,
    headers: Record<string, string>,
): NextResponse<ApiErrorBody> {
    return apiError({
        code: "rate_limited",
        type: "rate_limited",
        message: "Too many requests. Retry after the interval indicated.",
        requestId,
        headers: { "Retry-After": String(retryAfterSeconds), ...headers },
    });
}
