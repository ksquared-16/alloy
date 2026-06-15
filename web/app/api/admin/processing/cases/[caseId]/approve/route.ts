import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { dbCompleteProcessingCaseWithResult } from "@/lib/pos/processingCase/processingCaseDb";
import { runMinimalDestinationHandoff } from "@/lib/pos/processingCase/approveHandoff";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/processing/cases/[caseId]/approve — POS-FP5 validation slice.
 *
 * Approving a Processing Case performs the minimal destination handoff (records
 * own truth — see approveHandoff) and flips the case to `completed`. Idempotent:
 * an already-completed/archived case returns its prior result without re-writing.
 * Org-scoped via the admin context; service-role client for the canonical write.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { caseId: rawCaseId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const supabase = createAdminClient();

    try {
        const { data: caseRow, error: caseErr } = await supabase
            .from("processing_cases")
            .select("id, status, metadata")
            .eq("org_id", ctx.orgId)
            .eq("id", caseId)
            .maybeSingle();
        if (caseErr) throw new Error(caseErr.message);
        if (!caseRow) return jsonError("Not found", 404);

        const row = caseRow as { status: string; metadata?: Record<string, unknown> };
        if (row.status === "completed" || row.status === "archived") {
            return jsonData({
                caseId,
                status: row.status,
                operationalResult: row.metadata?.operational_result ?? null,
                alreadyDone: true,
            });
        }

        const { data: src, error: srcErr } = await supabase
            .from("processing_case_sources")
            .select("source_kind, source_id")
            .eq("org_id", ctx.orgId)
            .eq("processing_case_id", caseId)
            .eq("role", "primary")
            .maybeSingle();
        if (srcErr) throw new Error(srcErr.message);

        const source = (src as { source_kind: string; source_id: string } | null) ?? null;
        const operationalResult = await runMinimalDestinationHandoff(supabase, ctx.orgId, source);

        // FP7: a case whose form lacks the required mapping (no person.email binding,
        // or the bound field was empty) must NOT silently complete. Leave it open so an
        // operator can fix the mapping and re-approve.
        if (operationalResult.kind === "needs_mapping") {
            return jsonData({ caseId, status: row.status, operationalResult, blocked: true });
        }

        await dbCompleteProcessingCaseWithResult(supabase, { orgId: ctx.orgId, caseId, result: operationalResult });
        return jsonData({ caseId, status: "completed", operationalResult });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to approve processing case" },
            { status: 500 }
        );
    }
}
