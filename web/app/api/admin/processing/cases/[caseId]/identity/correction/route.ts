import { NextRequest, NextResponse } from "next/server";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import {
    recordCorrection,
    operatorErrorResponse,
    resolveOperatorRoute,
} from "@/lib/pos/processingIdentity/operator";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/processing/cases/[caseId]/identity/correction
 *
 * Records an operator correction of an extracted fact. Appends a NEW fact version
 * (lineage via corrected_from) — the original is never overwritten.
 * Body: { originalFactId, correctedNormalizedValue }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const { caseId } = await params;
    const resolved = await resolveOperatorRoute(caseId);
    if (resolved instanceof NextResponse) return resolved;

    const body = (await request.json().catch(() => null)) as {
        originalFactId?: string;
        correctedNormalizedValue?: string;
    } | null;
    if (!body?.originalFactId || typeof body.correctedNormalizedValue !== "string") {
        return jsonError("originalFactId and correctedNormalizedValue are required", 400);
    }

    try {
        const fact = await recordCorrection(resolved.deps, {
            caseId: resolved.caseId,
            originalFactId: body.originalFactId,
            correctedNormalizedValue: body.correctedNormalizedValue,
        });
        return jsonData({ fact });
    } catch (e) {
        return operatorErrorResponse(e);
    }
}
