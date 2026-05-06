import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { validateFormSchema } from "@/lib/forms/schema";
import { dbGetFormDefinition, dbInsertVersion, dbMaxVersionNumber } from "@/lib/admin/forms/formsAdminDb";
import { catchSchemaValidation, jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

/** POST /api/admin/forms/[formId]/versions — create draft version (admin only). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { formId: rawId } = await params;
    const formId = parseUuidParam(rawId, "formId");
    if (formId instanceof NextResponse) return formId;

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    if (!body.schema_json || typeof body.schema_json !== "object") {
        return jsonError("schema_json is required", 400);
    }

    try {
        validateFormSchema(body.schema_json);
    } catch (e) {
        const resp = catchSchemaValidation(e);
        if (resp) return resp;
        throw e;
    }

    const supabase = createAdminClient();
    const { data: form, error: formErr } = await dbGetFormDefinition(supabase, ctx.orgId, formId);
    if (formErr) return NextResponse.json({ error: formErr.message }, { status: 500 });
    if (!form) return jsonError("Not found", 404);

    let nextNum: number;
    try {
        nextNum = (await dbMaxVersionNumber(supabase, formId)) + 1;
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Version lookup failed" }, { status: 500 });
    }

    const pdf_mapping_json =
        body.pdf_mapping_json === undefined ? null : (body.pdf_mapping_json as unknown);
    const metadata =
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : {};

    const { data, error } = await dbInsertVersion(supabase, {
        form_definition_id: formId,
        org_id: ctx.orgId,
        version_number: nextNum,
        status: "draft",
        schema_json: body.schema_json,
        pdf_mapping_json,
        metadata,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return jsonData(data, { status: 201 });
}
