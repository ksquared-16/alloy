import { NextRequest, NextResponse } from "next/server";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import {
    recordResolutionDecision,
    operatorErrorResponse,
    resolveOperatorRoute,
} from "@/lib/pos/processingIdentity/operator";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/processing/cases/[caseId]/identity/resolution
 *
 * Persists a durable operator resolution decision on a subject resolution
 * (select candidate / reject / declare-new / mark-unresolved / request-info).
 * Body: { resolutionId, decisionAction, selectedCandidateId? }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const { caseId } = await params;
    const resolved = await resolveOperatorRoute(caseId);
    if (resolved instanceof NextResponse) return resolved;

    const body = (await request.json().catch(() => null)) as {
        resolutionId?: string;
        decisionAction?: string;
        selectedCandidateId?: string | null;
        createNewOverrideReason?: string | null;
        createNewOverrideReasonCode?: string | null;
    } | null;
    if (!body?.resolutionId || !body.decisionAction) {
        return jsonError("resolutionId and decisionAction are required", 400);
    }

    try {
        await recordResolutionDecision(resolved.deps, {
            caseId: resolved.caseId,
            resolutionId: body.resolutionId,
            decisionAction: body.decisionAction,
            selectedCandidateId: body.selectedCandidateId ?? null,
            createNewOverrideReason: body.createNewOverrideReason ?? null,
            createNewOverrideReasonCode: body.createNewOverrideReasonCode ?? null,
        });
        return jsonData({ ok: true });
    } catch (e) {
        return operatorErrorResponse(e);
    }
}
