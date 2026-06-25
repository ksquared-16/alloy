import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { buildFormDraftForCaseSafe } from "@/lib/pos/processingCase/formDraft/buildFormDraftForCaseSafe";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/processing/cases/[caseId]/form-draft — POS-FP12 (Workflow A).
 *
 * "Create form from document": recreate the case's primary document structure as a
 * draft Alloy form and store it on the case (`metadata.form_draft_preview`).
 * PREVIEW ONLY — no form_definition is created, nothing is published, no records change.
 * Org-scoped via the admin context.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { caseId: rawCaseId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const supabase = createAdminClient();

    try {
        // Case must exist and belong to the org.
        const { data: caseRow, error: caseErr } = await supabase
            .from("processing_cases")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("id", caseId)
            .maybeSingle();
        if (caseErr) throw new Error(caseErr.message);
        if (!caseRow) return jsonError("Not found", 404);

        const draft = await buildFormDraftForCaseSafe(supabase, { orgId: ctx.orgId, caseId });
        if (!draft) {
            return jsonError("Could not create a form draft — this case has no document source.", 422);
        }
        return jsonData({ caseId, form_draft_preview: draft });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to create form draft" },
            { status: 500 }
        );
    }
}
