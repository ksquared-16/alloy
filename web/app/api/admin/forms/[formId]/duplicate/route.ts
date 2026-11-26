import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { duplicateFormDefinitionForAdmin } from "@/lib/admin/forms/duplicateFormDefinitionForAdmin";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { FORMS_AUTHOR, requireFormsCapability } from "@/lib/access/formsAuthority";

/** POST /api/admin/forms/[formId]/duplicate — copy form schema; no submissions or links. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireFormsCapability(ctx, FORMS_AUTHOR);
    if (denied) return denied;

    const { formId: rawFormId } = await params;
    const formId = parseUuidParam(rawFormId, "formId");
    if (formId instanceof NextResponse) return formId;

    const supabase = createAdminClient();
    try {
        const result = await duplicateFormDefinitionForAdmin(supabase, ctx.orgId, formId);
        if (!result.ok) return jsonError(result.message, result.status);
        return jsonData(result.form, { status: 201 });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Duplicate failed" }, { status: 500 });
    }
}
