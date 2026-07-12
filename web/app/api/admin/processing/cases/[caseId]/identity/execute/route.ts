import { NextRequest, NextResponse } from "next/server";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import {
    executeApprovedPlanForCase,
    operatorErrorResponse,
    resolveOperatorRoute,
} from "@/lib/pos/processingIdentity/operator";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/processing/cases/[caseId]/identity/execute
 *
 * Explicit operator-triggered execution of an APPROVED plan through the
 * deterministic commit executor. This is the ONLY authorized path to execution:
 * no intake source may reach it. Requires a privileged operator and a valid
 * approval; preflight fails closed on staleness / tamper / tenant mismatch.
 * Idempotent per executionIdempotencyKey (safe retry / resume).
 * Body: { planId, executionIdempotencyKey, currentRecordVersions? }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const { caseId } = await params;
    const resolved = await resolveOperatorRoute(caseId);
    if (resolved instanceof NextResponse) return resolved;

    const body = (await request.json().catch(() => null)) as {
        planId?: string;
        executionIdempotencyKey?: string;
        currentRecordVersions?: Record<string, string>;
    } | null;
    if (!body?.planId || !body.executionIdempotencyKey) {
        return jsonError("planId and executionIdempotencyKey are required", 400);
    }

    try {
        const attempt = await executeApprovedPlanForCase(resolved.deps, {
            caseId: resolved.caseId,
            planId: body.planId,
            executionIdempotencyKey: body.executionIdempotencyKey,
            currentRecordVersions: body.currentRecordVersions,
        });
        return jsonData({ attempt });
    } catch (e) {
        return operatorErrorResponse(e);
    }
}
