import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { archiveProcessingCaseForAdmin } from "@/lib/pos/processingCase/archiveProcessingCaseForAdmin";

export const dynamic = "force-dynamic";

/** POST /api/admin/processing/cases/[caseId]/archive — soft-archive import from Work queue. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { caseId: rawId } = await params;
    const caseId = parseUuidParam(rawId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const supabase = createAdminClient();
    try {
        const result = await archiveProcessingCaseForAdmin(supabase, ctx.orgId, caseId);
        if (!result.ok) return jsonError(result.message, result.status);
        return jsonData({ archived: true, ...result.archived });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Archive failed" }, { status: 500 });
    }
}
