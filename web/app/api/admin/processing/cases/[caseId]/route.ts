import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    makeDefaultSourceDisplayResolverRegistry,
    makeProcessingCaseReadDeps,
} from "@/lib/pos/processingCase/readModel/processingCaseReadModelDb";
import { getProcessingCaseDetail } from "@/lib/pos/processingCase/readModel/processingCaseReadModelService";
import { makeDefaultSourceEvidenceRegistry } from "@/lib/pos/processingCase/readModel/processingCaseEvidenceDb";
import { resolveSourceEvidence } from "@/lib/pos/processingCase/readModel/resolveSourceEvidence";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/processing/cases/[caseId] — read-only Processing Case detail (POS-FP4).
 *
 * Delegates to the FP2 read model (`getProcessingCaseDetail`) and the FP2-owned
 * source-evidence resolver. The route only parses + serializes; no duplicated
 * read-model logic. Read-only (GET); no mutation/promotion.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { caseId: rawCaseId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const supabase = createAdminClient();
    const deps = makeProcessingCaseReadDeps(supabase);
    const displayRegistry = makeDefaultSourceDisplayResolverRegistry(supabase, ctx.orgId);

    try {
        const detail = await getProcessingCaseDetail(deps, displayRegistry, { orgId: ctx.orgId, id: caseId });
        if (!detail) return jsonError("Not found", 404);
        const evidenceRegistry = makeDefaultSourceEvidenceRegistry(supabase, ctx.orgId);
        const result = await resolveSourceEvidence(detail, evidenceRegistry);
        return jsonData(result);
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to load processing case" },
            { status: 500 }
        );
    }
}
