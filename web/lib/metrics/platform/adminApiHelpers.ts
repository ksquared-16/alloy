import { NextResponse } from "next/server";
import { getAdminContextCached, adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { apiError } from "@/lib/api/apiResponse";
import { safeErrorMessage, toValidationDetails } from "@/lib/api/apiErrors";
import type { CorrelationIdSource } from "@/lib/api/correlationId";

export async function requireAnalyticsV2AdminContext() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return { ok: false as const, response: adminContextFailureResponse(ctx) };

    return { ok: true as const, ctx };
}

export async function requireAnalyticsV2AdminMutate() {
    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate;
    if (gate.ctx.role !== "admin") {
        return {
            ok: false as const,
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
    }
    return gate;
}

/**
 * Legacy validation error (bare `{ error }`). Retained for analytics sibling routes
 * (visualizations / placements / rollups) that are not yet on the standard contract.
 */
export function zodErrorResponse(error: unknown) {
    const msg = error instanceof Error ? error.message : "Validation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
}

/**
 * Standard-envelope validation error for the migrated metrics family. Surfaces the
 * real message in `error.message` and flattened zod issues (when present) in
 * `error.details`. @see docs/api/api-response-contract.md
 */
export function metricValidationError(error: unknown, request?: CorrelationIdSource) {
    return apiError("VALIDATION_ERROR", safeErrorMessage(error, "Validation failed"), 400, toValidationDetails(error), {
        request,
    });
}
