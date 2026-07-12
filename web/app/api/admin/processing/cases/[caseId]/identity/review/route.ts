import { NextRequest, NextResponse } from "next/server";
import { jsonData } from "@/lib/admin/forms/formsAdminResponses";
import {
    loadCaseReview,
    operatorErrorResponse,
    resolveOperatorRoute,
} from "@/lib/pos/processingIdentity/operator";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/processing/cases/[caseId]/identity/review
 *
 * Loads the full identity-review state (facts, resolutions, latest plan + diff,
 * active approval, latest attempt, derived readiness) through the canonical
 * operator service. Read-only; no mutation.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const { caseId } = await params;
    const resolved = await resolveOperatorRoute(caseId);
    if (resolved instanceof NextResponse) return resolved;
    try {
        const state = await loadCaseReview(resolved.deps, resolved.caseId);
        return jsonData(state);
    } catch (e) {
        return operatorErrorResponse(e);
    }
}
