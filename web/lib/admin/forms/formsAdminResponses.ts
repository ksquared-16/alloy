import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { NormalizedValidationError } from "@/lib/forms/validateSubmission";
import { normalizeValidationErrors } from "@/lib/forms/validateSubmission";

export function jsonData<T>(data: T, init?: { status?: number }): NextResponse {
    return NextResponse.json({ data }, { status: init?.status ?? 200 });
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>): NextResponse {
    return NextResponse.json({ error: message, ...extra }, { status });
}

export function jsonValidationErrors(
    message: string,
    errors: NormalizedValidationError[],
    status = 400
): NextResponse {
    return NextResponse.json({ error: message, validation_errors: errors }, { status });
}

export function catchSchemaValidation(e: unknown): NextResponse | null {
    if (e instanceof ZodError) {
        return jsonValidationErrors("Invalid form schema", normalizeValidationErrors(e));
    }
    return null;
}

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseUuidParam(raw: string | undefined, label: string): string | NextResponse {
    const v = raw?.trim() ?? "";
    if (!v || !UUID_RE.test(v)) {
        return jsonError(`Invalid ${label}`, 400);
    }
    return v;
}
