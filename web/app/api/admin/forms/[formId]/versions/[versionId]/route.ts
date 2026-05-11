import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { validateFormSchema } from "@/lib/forms/schema";
import { dbGetVersion, dbUpdateVersionDraft } from "@/lib/admin/forms/formsAdminDb";
import { catchSchemaValidation, jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

/** GET /api/admin/forms/[formId]/versions/[versionId] — full version row including schema_json (admin). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ formId: string; versionId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

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
    return jsonData(existing);
}

/** PATCH /api/admin/forms/[formId]/versions/[versionId] — draft only (admin only). */
export async function PATCH(
    request: NextRequest,
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

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const supabase = createAdminClient();
    const { data: existing, error: loadErr } = await dbGetVersion(supabase, ctx.orgId, versionId);
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!existing) return jsonError("Not found", 404);
    if ((existing as { form_definition_id: string }).form_definition_id !== formId) {
        return jsonError("Not found", 404);
    }

    if ((existing as { status: string }).status !== "draft") {
        return jsonError("Published or archived versions cannot be updated", 409);
    }

    const patch: {
        schema_json?: unknown;
        pdf_mapping_json?: unknown | null;
        metadata?: Record<string, unknown>;
    } = {};

    if (body.schema_json !== undefined) {
        if (typeof body.schema_json !== "object" || body.schema_json === null) {
            return jsonError("schema_json must be an object", 400);
        }
        try {
            validateFormSchema(body.schema_json);
        } catch (e) {
            const resp = catchSchemaValidation(e);
            if (resp) return resp;
            throw e;
        }
        patch.schema_json = body.schema_json;
    }
    if (body.pdf_mapping_json !== undefined) {
        patch.pdf_mapping_json = body.pdf_mapping_json as unknown;
    }
    if (body.metadata !== undefined) {
        if (typeof body.metadata !== "object" || body.metadata === null || Array.isArray(body.metadata)) {
            return jsonError("metadata must be an object", 400);
        }
        patch.metadata = body.metadata as Record<string, unknown>;
    }

    if (Object.keys(patch).length === 0) return jsonError("No valid fields to update", 400);

    const { data, error } = await dbUpdateVersionDraft(supabase, ctx.orgId, versionId, patch);
    if (error) {
        if (error.code === "PGRST116") {
            return jsonError("Cannot update non-draft version", 409);
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonData(data);
}
