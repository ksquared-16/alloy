import { NextRequest, NextResponse } from "next/server";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import {
    approvePlan,
    operatorErrorResponse,
    resolveOperatorRoute,
} from "@/lib/pos/processingIdentity/operator";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/processing/cases/[caseId]/identity/approve
 *
 * Binds an approval to the EXACT plan version + content hash. Requires a
 * privileged operator (admin/ops). Fails closed if the plan is stale, superseded,
 * has unresolved blocking conflicts, or is not ready. Does NOT execute.
 * Body: { planId, blockingConflicts?: string[] }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const { caseId } = await params;
    const resolved = await resolveOperatorRoute(caseId);
    if (resolved instanceof NextResponse) return resolved;

    const body = (await request.json().catch(() => null)) as {
        planId?: string;
        blockingConflicts?: string[];
    } | null;
    if (!body?.planId) return jsonError("planId is required", 400);

    try {
        const approval = await approvePlan(resolved.deps, {
            caseId: resolved.caseId,
            planId: body.planId,
            blockingConflicts: body.blockingConflicts,
        });
        return jsonData({ approval });
    } catch (e) {
        return operatorErrorResponse(e);
    }
}
