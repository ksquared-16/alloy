/**
 * Phase 0 behavioral test harness — route invocation.
 *
 * Communications had zero route-level coverage: every prior "route test" in
 * tests/communications/ was `readFileSync` + regex asserting code SHAPE, which
 * passes while behavior is broken. Route-level invocation is already an
 * established pattern elsewhere in this repo (54 test files import handlers
 * directly); this module makes it reusable rather than re-hand-rolled per test.
 *
 * Scope: minimum needed to validate Phase 0. No framework, no magic.
 */
import { NextRequest } from "next/server";

export type RouteResponse<T = unknown> = {
    status: number;
    ok: boolean;
    body: T;
    headers: Headers;
};

type JsonBody = Record<string, unknown> | unknown[] | null;

const DEFAULT_ORIGIN = "http://localhost:3012";

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(path, DEFAULT_ORIGIN);
    for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
}

/** Build a NextRequest a route handler will accept. */
export function buildRequest(opts: {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    path: string;
    query?: Record<string, string | number | undefined>;
    body?: JsonBody;
    headers?: Record<string, string>;
}): NextRequest {
    const method = opts.method ?? "GET";
    const headers = new Headers(opts.headers ?? {});
    let init: ConstructorParameters<typeof NextRequest>[1] = { method, headers };

    if (opts.body !== undefined && method !== "GET") {
        headers.set("content-type", "application/json");
        init = { method, headers, body: JSON.stringify(opts.body) };
    }

    return new NextRequest(buildUrl(opts.path, opts.query), init);
}

/**
 * Invoke a route handler and normalize the response.
 *
 * Non-JSON bodies are returned as `{ raw }` rather than throwing, so a handler
 * that 500s with an HTML error page produces a readable assertion failure.
 */
export async function invokeRoute<T = unknown>(
    handler: (req: NextRequest, ctx?: never) => Promise<Response> | Response,
    request: NextRequest,
    routeContext?: unknown
): Promise<RouteResponse<T>> {
    const res = await (handler as (req: NextRequest, ctx?: unknown) => Promise<Response> | Response)(
        request,
        routeContext
    );

    let body: unknown;
    const text = await res.text();
    try {
        body = text.length > 0 ? JSON.parse(text) : null;
    } catch {
        body = { raw: text };
    }

    return { status: res.status, ok: res.ok, body: body as T, headers: res.headers };
}

/** Route handlers that take `{ params: Promise<...> }` (Next 15 dynamic segments). */
export function routeParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
    return { params: Promise.resolve(params) };
}
