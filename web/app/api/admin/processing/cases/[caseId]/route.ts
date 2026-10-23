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
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { discloseFormDraftTextPreview } from "@/lib/documents/extractedTextDisclosure";

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
        const evidenceRegistry = makeDefaultSourceEvidenceRegistry(supabase, ctx.orgId, { permissionKeys: ctx.permissionKeys });
        const result = await resolveSourceEvidence(detail, evidenceRegistry);
        // D1b: the stored form-draft preview carries OCR text; it is shown only to an actor who may
        // read the source document's extracted text.
        const access = await getAdminAccessContextCached();
        const textActor = access.ok ? access : { roleKeys: [], permissionKeys: [] };
        return jsonData({
            ...result,
            formDraftPreview: await discloseFormDraftTextPreview(supabase, ctx.orgId, textActor, result.formDraftPreview),
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to load processing case" },
            { status: 500 }
        );
    }
}
