/**
 * POST /api/admin/processing/cases/[caseId]/reject — "Reject / Do not create".
 *
 * Body: `{ reason_code, note? }`. Processing operator authority (PROCESSING_OPERATE), the same as
 * approve. Closes the case as rejected through rejectProcessingCase; nothing canonical is created.
 */
import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { PROCESSING_OPERATE, requireProcessingCapability } from "@/lib/access/processingAuthority";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { emitEvent } from "@/lib/emitEvent";
import { rejectProcessingCase } from "@/lib/pos/processingCase/rejectProcessingCase";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireProcessingCapability(ctx, PROCESSING_OPERATE);
    if (denied) return denied;
    const caseId = parseUuidParam((await params).caseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;
    let body: { reason_code?: unknown; note?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return jsonError("Invalid JSON body", 400);
    }
    try {
        const result = await rejectProcessingCase(createAdminClient(), {
            orgId: ctx.orgId,
            caseId,
            reasonCode: typeof body.reason_code === "string" ? body.reason_code : "",
            note: typeof body.note === "string" ? body.note : null,
            actorId: ctx.userId ?? null,
            emit: emitEvent,
        });
        if (!result.ok) return jsonError(result.message, result.status, { code: result.code });
        return jsonData({ caseId, status: "completed", disposition: result.disposition, alreadyRejected: result.alreadyRejected });
    } catch (e) {
        console.error("[processing reject] failed", e instanceof Error ? e.message : e);
        return jsonError("The case could not be rejected.", 500);
    }
}
