import { NextResponse } from "next/server";

export function tourPublicJson(data: unknown, init?: { status?: number }) {
    return NextResponse.json(data, { status: init?.status ?? 200 });
}

export function tourPublicErr(message: string, status: number, extras?: Record<string, unknown>) {
    return NextResponse.json({ ok: false, error: message, ...extras }, { status });
}

export function tourPublicRateLimited(retryAfterSec: number) {
    return NextResponse.json(
        { ok: false, error: "Too many requests", code: "RATE_LIMIT" },
        { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfterSec)) } }
    );
}
