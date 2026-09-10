import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { validateFormSchema } from "@/lib/forms/schema";
import { dbGetFormDefinition, dbGetVersion, dbInsertVersion, dbMaxVersionNumber } from "@/lib/admin/forms/formsAdminDb";
import { catchSchemaValidation, jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { FORMS_AUTHOR, requireFormsCapability } from "@/lib/access/formsAuthority";

/** POST /api/admin/forms/[formId]/versions — create draft version (admin only). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireFormsCapability(ctx, FORMS_AUTHOR);
    if (denied) return denied;

    const { formId: rawId } = await params;
    const formId = parseUuidParam(rawId, "formId");
    if (formId instanceof NextResponse) return formId;

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const supabase = createAdminClient();
    const { data: form, error: formErr } = await dbGetFormDefinition(supabase, ctx.orgId, formId);
    if (formErr) return NextResponse.json({ error: formErr.message }, { status: 500 });
    if (!form) return jsonError("Not found", 404);

    let schemaSource: unknown = body.schema_json;
    let clonedPdfMapping: unknown = null;
    const cloneFrom = body.clone_from_version_id;
    if (schemaSource === undefined && typeof cloneFrom === "string" && cloneFrom.trim()) {
        const cloneId = parseUuidParam(cloneFrom.trim(), "clone_from_version_id");
        if (cloneId instanceof NextResponse) return cloneId;
        const { data: src, error: srcErr } = await dbGetVersion(supabase, ctx.orgId, cloneId);
        if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 });
        if (!src) return jsonError("clone_from_version_id not found", 404);
        if ((src as { form_definition_id: string }).form_definition_id !== formId) {
            return jsonError("clone_from_version_id does not belong to this form", 400);
        }
        schemaSource = (src as { schema_json: unknown }).schema_json;
        /*
         * A clone inherits the source document too.
         *
         * The mapping describes where the SAME schema's answers print on the SAME paperwork, so a
         * clone that carries the schema and drops the mapping produces a revision that can no longer
         * render the document it was generated from. Publishing a Form imported from a school's
         * paperwork and then editing it once was enough to lose that silently, because the next
         * draft is made by cloning. An explicit `pdf_mapping_json` in the body still wins, including
         * an explicit null to detach the source.
         */
        clonedPdfMapping = (src as { pdf_mapping_json?: unknown }).pdf_mapping_json ?? null;
    }

    if (!schemaSource || typeof schemaSource !== "object") {
        return jsonError("schema_json is required (or pass clone_from_version_id)", 400);
    }

    try {
        validateFormSchema(schemaSource);
    } catch (e) {
        const resp = catchSchemaValidation(e);
        if (resp) return resp;
        throw e;
    }

    let nextNum: number;
    try {
        nextNum = (await dbMaxVersionNumber(supabase, formId)) + 1;
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Version lookup failed" }, { status: 500 });
    }

    const pdf_mapping_json =
        body.pdf_mapping_json === undefined ? clonedPdfMapping : (body.pdf_mapping_json as unknown);
    const metadata =
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : {};

    const { data, error } = await dbInsertVersion(supabase, {
        form_definition_id: formId,
        org_id: ctx.orgId,
        version_number: nextNum,
        status: "draft",
        schema_json: schemaSource,
        pdf_mapping_json,
        metadata,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return jsonData(data, { status: 201 });
}
