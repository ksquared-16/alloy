import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { buildRequestedTourOperatorView } from "@/lib/tours/publicCalendar/requestedTourOperatorView";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/processing/cases/[caseId]/requested-tour — the case's requested tour (S7).
 *
 * Read-only, same access as the case detail it belongs to. Live answers — is the time still
 * offered, the booking's status, the confirmation outcome, current alternatives — are read
 * from their owners here; nothing is written. 404 when the case has no requested tour.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { caseId: rawCaseId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    try {
        const view = await buildRequestedTourOperatorView(createAdminClient(), { orgId: ctx.orgId, caseId });
        if (!view) return jsonError("Not found", 404);
        return jsonData(view);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load requested tour" }, { status: 500 });
    }
}
