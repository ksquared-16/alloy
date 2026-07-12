import { NextRequest, NextResponse } from "next/server";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import {
    buildPlan,
    operatorErrorResponse,
    resolveOperatorRoute,
    type IdentityResolutionSet,
} from "@/lib/pos/processingIdentity/operator";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/processing/cases/[caseId]/identity/plan
 *
 * Builds (or revises) a durable, versioned, content-hashed Commit Plan from the
 * operator's resolution decisions via the deterministic recommendation builder.
 * When `resolutionSet` is omitted, it is derived from the case's durable
 * resolution decisions. A new version supersedes the prior and invalidates approval.
 * Body: { resolutionSet?: { subjects: [...] }, sourceResolutionVersions?: string[] }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const { caseId } = await params;
    const resolved = await resolveOperatorRoute(caseId);
    if (resolved instanceof NextResponse) return resolved;

    const body = (await request.json().catch(() => null)) as {
        resolutionSet?: IdentityResolutionSet;
        sourceResolutionVersions?: string[];
    } | null;
    if (body?.resolutionSet && !Array.isArray(body.resolutionSet.subjects)) {
        return jsonError("resolutionSet.subjects must be an array", 400);
    }

    try {
        const result = await buildPlan(resolved.deps, {
            caseId: resolved.caseId,
            resolutionSet: body?.resolutionSet,
            sourceResolutionVersions: body?.sourceResolutionVersions,
        });
        return jsonData(result);
    } catch (e) {
        return operatorErrorResponse(e);
    }
}
