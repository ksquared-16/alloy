import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { archiveFormDefinitionForAdmin } from "@/lib/admin/forms/archiveFormDefinitionForAdmin";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

/** POST /api/admin/forms/[formId]/archive — soft-archive form and deactivate share links. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { formId: rawId } = await params;
    const formId = parseUuidParam(rawId, "formId");
    if (formId instanceof NextResponse) return formId;

    const supabase = createAdminClient();
    try {
        const result = await archiveFormDefinitionForAdmin(supabase, ctx.orgId, formId);
        if (!result.ok) return jsonError(result.message, result.status);
        return jsonData({ archived: true, ...result.archived });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Archive failed" }, { status: 500 });
    }
}
