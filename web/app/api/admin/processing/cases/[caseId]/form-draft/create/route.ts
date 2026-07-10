import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import {
    createFormFromCaseDraft,
    makeCreateFormDepsFromSupabase,
} from "@/lib/pos/processingCase/formDraft/createFormFromCaseDraft";
import { formAuthoringWorkspacePath } from "@/lib/admin/forms/formAuthoringWorkspacePath";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/processing/cases/[caseId]/form-draft/create — POS-FP13.
 *
 * Turn the case's stored `form_draft_preview` into a real, UNPUBLISHED editable form
 * (form_definition + draft version) the operator can open in the Forms builder. Reuses
 * existing Forms infrastructure. Idempotent — repeat calls return the existing form,
 * never a duplicate. No publish, no public link, no records, no matching.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { caseId: rawCaseId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    let formNameOverride: string | null = null;
    try {
        const body = (await request.json()) as { form_name?: unknown };
        if (typeof body.form_name === "string" && body.form_name.trim()) {
            formNameOverride = body.form_name.trim();
        }
    } catch {
        // Empty body is allowed — create uses stored preview name.
    }

    const supabase = createAdminClient();

    try {
        if (formNameOverride) {
            const { data: caseRow, error: caseErr } = await supabase
                .from("processing_cases")
                .select("metadata")
                .eq("org_id", ctx.orgId)
                .eq("id", caseId)
                .maybeSingle();
            if (caseErr) throw new Error(caseErr.message);
            if (!caseRow) return jsonError("Not found", 404);
            const metadata =
                caseRow.metadata && typeof caseRow.metadata === "object" && !Array.isArray(caseRow.metadata)
                    ? (caseRow.metadata as Record<string, unknown>)
                    : {};
            const previewRaw = metadata.form_draft_preview;
            if (previewRaw && typeof previewRaw === "object" && !Array.isArray(previewRaw)) {
                await supabase
                    .from("processing_cases")
                    .update({
                        metadata: {
                            ...metadata,
                            form_draft_preview: {
                                ...(previewRaw as Record<string, unknown>),
                                generated_form_name: formNameOverride,
                            },
                        },
                    })
                    .eq("org_id", ctx.orgId)
                    .eq("id", caseId);
            }
        }

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
                form_name: result.formName,
                form_version_id: result.formVersionId,
                created_at: result.createdAt,
                already_created: result.alreadyCreated,
                builder_path: formAuthoringWorkspacePath(result.formId),
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
