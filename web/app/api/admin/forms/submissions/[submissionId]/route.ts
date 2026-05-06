import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { dbGetSubmission } from "@/lib/admin/forms/formsAdminDb";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

/** GET /api/admin/forms/submissions/[submissionId] */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { submissionId: raw } = await params;
    const submissionId = parseUuidParam(raw, "submissionId");
    if (submissionId instanceof NextResponse) return submissionId;

    const supabase = createAdminClient();
    const { data, error } = await dbGetSubmission(supabase, ctx.orgId, submissionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return jsonError("Not found", 404);
    return jsonData(data);
}
