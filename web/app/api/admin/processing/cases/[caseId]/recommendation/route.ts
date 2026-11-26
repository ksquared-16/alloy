import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { recommendationFromFormSubmission } from "@/lib/pos/processingCase/recommendation/recommendationFromSubmission";
import { listProcessingResolutionsByCase } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import { pickLatestResolutionPerSubject } from "@/lib/pos/processingIdentity/operator/recommendationBuilder";
import { evaluateCaseLeadPlacement, type CaseLeadPlacementReadiness } from "@/lib/pos/processingIdentity/operator/operatorReviewService";

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

        // Shared FP8a computation (same logic the queue enrichment uses) — the per-case view also
        // enriches match candidates with identifying detail for the expand-in-place card (§3).
        const result = await recommendationFromFormSubmission(supabase, ctx.orgId, source.source_id, {
            enrichCandidates: true,
        });
        // What approval will do with the ENROLLMENT LEAD is the lead subject's own resolution — reuse the
        // family's open case, or open one — not an inference from the parent match. A matched parent with
        // no open case gets a new lead; one with an open case keeps it.
        let leadPlan: "reuse" | "create" | null = null;
        try {
            const rows = pickLatestResolutionPerSubject(await listProcessingResolutionsByCase(supabase, ctx.orgId, caseId));
            const lead = rows.find((r) => r.subject_role === "lead");
            if (lead?.decision_action === "link_existing" && lead.selected_candidate_id) leadPlan = "reuse";
            else if (lead?.decision_action === "create_new") leadPlan = "create";
        } catch {
            leadPlan = null;
        }
        // Can a NEW lead from this case be placed? The same resolver approval uses — so "Ready to create"
        // and an enabled Approve never promise what approval will refuse (P1-close, D2).
        let leadPlacement: CaseLeadPlacementReadiness | null = null;
        try {
            leadPlacement = await evaluateCaseLeadPlacement(supabase, ctx.orgId, caseId);
        } catch {
            leadPlacement = null;
        }
        return jsonData({ ...result, leadPlan, leadPlacement });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to build recommendation" },
            { status: 500 }
        );
    }
}
