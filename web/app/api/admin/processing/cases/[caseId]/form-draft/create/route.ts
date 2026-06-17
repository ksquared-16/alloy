import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import {
    createFormFromCaseDraft,
    makeCreateFormDepsFromSupabase,
} from "@/lib/pos/processingCase/formDraft/createFormFromCaseDraft";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/processing/cases/[caseId]/form-draft/create — POS-FP13.
 *
 * Turn the case's stored `form_draft_preview` into a real, UNPUBLISHED editable form
 * (form_definition + draft version) the operator can open in the Forms builder. Reuses
 * existing Forms infrastructure. Idempotent — repeat calls return the existing form,
 * never a duplicate. No publish, no public link, no records, no matching.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { caseId: rawCaseId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const supabase = createAdminClient();

    try {
        const result = await createFormFromCaseDraft(makeCreateFormDepsFromSupabase(supabase), {
            orgId: ctx.orgId,
            caseId,
        });

        if (!result.ok) {
            const status = result.code === "not_found" ? 404 : result.code === "no_preview" ? 422 : 400;
            return jsonError(result.message, status);
        }

        return jsonData(
            {
                caseId,
                form_id: result.formId,
                form_version_id: result.formVersionId,
                created_at: result.createdAt,
                already_created: result.alreadyCreated,
                builder_path: `/admin/forms/${result.formId}`,
            },
            { status: result.alreadyCreated ? 200 : 201 }
        );
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to create form from draft" },
            { status: 500 }
        );
    }
}
