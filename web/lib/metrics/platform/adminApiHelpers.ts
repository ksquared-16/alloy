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

/**
 * THE ROLE TITLE IS GONE; `reports.write` IS THE AUTHORITY.
 *
 * This asked `ctx.role !== "admin"`, and it sat on all thirteen Analytics mutation routes. That
 * made the capability decorative in the one direction that matters: a custom Analytics Writer
 * holding `reports.write` was refused, while an admin whose package withholds the key was
 * admitted. Every caller now runs `requireAnalyticsManageAccess()` first — checked, not assumed,
 * and asserted by RL-17 — so the title behind it only contradicted the grant.
 *
 * The function is KEPT rather than deleted: its callers need the resolved admin context, and
 * removing it would have meant editing thirteen handlers to inline the same two lines. What it no
 * longer does is decide authority.
 */
export async function requireAnalyticsV2AdminMutate() {
    return requireAnalyticsV2AdminContext();
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
