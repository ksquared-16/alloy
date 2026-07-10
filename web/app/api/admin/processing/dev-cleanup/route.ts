import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import {
    PROCESSING_DEV_CLEANUP_CONFIRM_TOKEN,
    applyProcessingDevCleanup,
    assertProcessingDevCleanupAllowed,
    planProcessingDevCleanup,
} from "@/lib/pos/processingDevCleanup";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/processing/dev-cleanup
 *
 * Dev/staging only. Dry-run by default; apply requires explicit confirmation token.
 */
export async function POST(request: NextRequest) {
    try {
        assertProcessingDevCleanupAllowed();
    } catch (e) {
        return jsonError(e instanceof Error ? e.message : "Forbidden", 403);
    }

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const body = (await request.json().catch(() => ({}))) as { apply?: boolean; confirm?: string };
    const apply = body.apply === true;
    if (apply && body.confirm !== PROCESSING_DEV_CLEANUP_CONFIRM_TOKEN) {
        return jsonError(`Confirmation token required: ${PROCESSING_DEV_CLEANUP_CONFIRM_TOKEN}`, 400);
    }

    const supabase = createAdminClient();
    try {
        if (!apply) {
            const plan = await planProcessingDevCleanup(supabase, ctx.orgId);
            return jsonData(plan);
        }
        const result = await applyProcessingDevCleanup(supabase, ctx.orgId);
        return jsonData(result);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Cleanup failed" }, { status: 500 });
    }
}
