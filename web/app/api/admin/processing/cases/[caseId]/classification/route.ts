import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import {
    buildOperatorClassification,
    validateOperatorCorrection,
} from "@/lib/pos/processingCase/classification/operatorCorrection";
import { dbStoreProcessingCaseClassification } from "@/lib/pos/processingCase/classification/processingCaseClassificationDb";
import { maybeReextractProcessingCaseAfterClassificationSafe } from "@/lib/pos/processingCase/extraction/maybeExtractProcessingCaseFromDocumentSafe";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/processing/cases/[caseId]/classification — POS-FP9 operator correction.
 *
 * Lets an operator confirm/correct/mark-unknown the classification on a case.
 * ANNOTATION ONLY: updates `case_type` + `metadata.classification` (with an explicit
 * `operator` signal and a `corrected_at` stamp). It does NOT change lifecycle status,
 * sources, proposals/recommendations, documents, or any business record.
 *
 * Body: { classification_key: <key>, status: "classified" | "unknown" }.
 * Org-scoped via the admin context; service-role client for the canonical annotation.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { caseId: rawCaseId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return jsonError("Expected a JSON body", 400);
    }
    const b = (body ?? {}) as { classification_key?: unknown; status?: unknown };

    const validation = validateOperatorCorrection({ classification_key: b.classification_key, status: b.status });
    if (!validation.ok) return jsonError(validation.error, 400);

    const supabase = createAdminClient();

    try {
        // 1) Case must exist and belong to the org. (Read only the lifecycle status so we
        //    can prove below that we never change it.)
        const { data: caseRow, error: caseErr } = await supabase
            .from("processing_cases")
            .select("id, status")
            .eq("org_id", ctx.orgId)
            .eq("id", caseId)
            .maybeSingle();
        if (caseErr) throw new Error(caseErr.message);
        if (!caseRow) return jsonError("Not found", 404);

        // 2) Build the operator result and persist it as an annotation only.
        const result = buildOperatorClassification({
            classification_key: validation.classification_key,
            status: validation.status,
        });
        const now = new Date();
        const stored = await dbStoreProcessingCaseClassification(supabase, {
            orgId: ctx.orgId,
            caseId,
            result,
            now,
            correctedAt: now,
        });

        // Re-run extraction with the corrected classification so candidates never go stale.
        // Best-effort: a failure here must NOT fail the correction (annotation already saved).
        const reextracted = await maybeReextractProcessingCaseAfterClassificationSafe(supabase, {
            orgId: ctx.orgId,
            caseId,
            classificationKey: validation.classification_key,
        });

        // Lifecycle status is echoed back unchanged (the store never writes `status`).
        return jsonData({
            caseId,
            status: (caseRow as { status: string }).status,
            classification: stored,
            extraction_candidate_count: reextracted?.candidates.length ?? null,
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to update classification" },
            { status: 500 }
        );
    }
}
