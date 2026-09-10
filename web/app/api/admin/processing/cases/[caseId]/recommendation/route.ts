import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { recommendationFromFormSubmission } from "@/lib/pos/processingCase/recommendation/recommendationFromSubmission";
import { listCaseFormSubmissionSources } from "@/lib/pos/processingCase/sources/listCaseFormSubmissionSources";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/processing/cases/[caseId]/recommendation — POS-FP8a (READ-ONLY).
 *
 * Returns the match-first recommendation (link / create / route) for everything the case rests on,
 * computed from the bound person fields via the non-mutating identity resolver. Writes nothing;
 * promotion happens later at approval (FP8c).
 *
 * ## A packet is several forms, and is answered as several forms
 *
 * This used to refuse any source that was not a bare `form_submission`, which meant a packet case —
 * the shape enrolment actually produces — got "not supported yet" where its recommendation should
 * be. It now enumerates the packet's ordered steps and asks the SAME question of each submission
 * independently, reusing `recommendationFromFormSubmission` unchanged.
 *
 * The steps are NOT merged before matching. Merging would mean resolving identity from a blend of
 * three forms and reporting one answer with no way to see which form supplied which fact; when two
 * steps disagree about who this is, that disagreement is the finding. `recommendation` stays the
 * first step that produced one — the application, in authored order — so existing callers keep the
 * field they read, and `steps` carries the rest with the form and step named.
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

        const submissions = await listCaseFormSubmissionSources(supabase, ctx.orgId, caseId);

        if (submissions.length === 0) {
            const { data: any_, error: anyErr } = await supabase
                .from("processing_case_sources")
                .select("source_kind")
                .eq("org_id", ctx.orgId)
                .eq("processing_case_id", caseId)
                .limit(1)
                .maybeSingle();
            if (anyErr) throw new Error(anyErr.message);
            const kind = (any_ as { source_kind?: string } | null)?.source_kind ?? null;
            if (!kind) return jsonData({ supported: false, reason: "Case has no primary source." });
            return jsonData({
                supported: false,
                sourceKind: kind,
                reason: `Recommendations are computed from form submissions; ${kind} carries none yet.`,
            });
        }

        // Each step answered on its own terms, in the order the family filled them.
        const steps = [];
        for (const entry of submissions) {
            const result = await recommendationFromFormSubmission(supabase, ctx.orgId, entry.submissionId, {
                enrichCandidates: true,
            });
            steps.push({
                submissionId: entry.submissionId,
                packetSessionId: entry.packetSessionId,
                stepIndex: entry.stepIndex,
                formName: entry.formName,
                formDefinitionVersionId: entry.formDefinitionVersionId,
                result,
            });
        }

        const primary = steps.find((s) => s.result.supported);
        if (!primary) {
            return jsonData({
                supported: false,
                reason: steps[0]?.result.supported === false ? steps[0].result.reason : "No step produced a recommendation.",
                steps,
            });
        }

        return jsonData({ ...primary.result, primaryStep: { submissionId: primary.submissionId, stepIndex: primary.stepIndex, formName: primary.formName }, steps });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to build recommendation" },
            { status: 500 }
        );
    }
}
