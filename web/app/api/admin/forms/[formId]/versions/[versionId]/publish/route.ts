import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { validateFormSchema } from "@/lib/forms/schema";
import { dbGetVersion, dbPublishVersion } from "@/lib/admin/forms/formsAdminDb";
import { catchSchemaValidation, jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

/** POST /api/admin/forms/[formId]/versions/[versionId]/publish — draft → published (admin only). */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ formId: string; versionId: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { formId: rawForm, versionId: rawVer } = await params;
    const formId = parseUuidParam(rawForm, "formId");
    if (formId instanceof NextResponse) return formId;
    const versionId = parseUuidParam(rawVer, "versionId");
    if (versionId instanceof NextResponse) return versionId;

    const supabase = createAdminClient();
    const { data: existing, error: loadErr } = await dbGetVersion(supabase, ctx.orgId, versionId);
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!existing) return jsonError("Not found", 404);
    if ((existing as { form_definition_id: string }).form_definition_id !== formId) {
        return jsonError("Not found", 404);
    }

    const row = existing as { status: string; schema_json: unknown };
    if (row.status !== "draft") {
        return jsonError("Only draft versions can be published", 409);
    }

    try {
        validateFormSchema(row.schema_json);
    } catch (e) {
        const resp = catchSchemaValidation(e);
        if (resp) return resp;
        throw e;
    }

    const { data, error } = await dbPublishVersion(supabase, ctx.orgId, versionId, ctx.userId);
    if (error) {
        if (error.code === "PGRST116") {
            return jsonError("Version is not in draft state or was modified concurrently", 409);
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonData(data);
}
