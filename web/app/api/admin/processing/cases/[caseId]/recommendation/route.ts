import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { recommendationFromFormSubmission } from "@/lib/pos/processingCase/recommendation/recommendationFromSubmission";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/processing/cases/[caseId]/recommendation — POS-FP8a (READ-ONLY).
 *
 * Returns the match-first recommendation (link / create / route) for a case's
 * primary form-submission source, computed from the bound person fields via the
 * non-mutating identity resolver. Writes nothing; promotion happens later at
 * approval (FP8c). Other source kinds return a clear unsupported response.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { caseId: rawCaseId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const supabase = createAdminClient();

    try {
        const { data: caseRow, error: caseErr } = await supabase
            .from("processing_cases")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("id", caseId)
            .maybeSingle();
        if (caseErr) throw new Error(caseErr.message);
        if (!caseRow) return jsonError("Not found", 404);

        const { data: src, error: srcErr } = await supabase
            .from("processing_case_sources")
            .select("source_kind, source_id")
            .eq("org_id", ctx.orgId)
            .eq("processing_case_id", caseId)
            .eq("role", "primary")
            .maybeSingle();
        if (srcErr) throw new Error(srcErr.message);
        const source = (src as { source_kind: string; source_id: string } | null) ?? null;

        if (!source) {
            return jsonData({ supported: false, reason: "Case has no primary source." });
        }
        if (source.source_kind !== "form_submission") {
            return jsonData({
                supported: false,
                sourceKind: source.source_kind,
                reason: `Recommendations support form submissions; ${source.source_kind} is not supported yet.`,
            });
        }

        // Shared FP8a computation (same logic the queue enrichment uses).
        const result = await recommendationFromFormSubmission(supabase, ctx.orgId, source.source_id);
        return jsonData(result);
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to build recommendation" },
            { status: 500 }
        );
    }
}
