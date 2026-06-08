import { NextResponse } from "next/server";
import type { NormalizedValidationError } from "@/lib/forms/validateSubmission";

export function publicOk<T>(data: T, status = 200): NextResponse {
    return NextResponse.json({ ok: true as const, data }, { status });
}

export function publicErr(
    message: string,
    status: number,
    extra?: { code?: string; validation_errors?: NormalizedValidationError[]; missing_fields?: string[] }
): NextResponse {
    return NextResponse.json({ ok: false as const, error: message, ...extra }, { status });
}
