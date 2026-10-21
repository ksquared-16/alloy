import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { PROCESSING_OPERATE, requireProcessingCapability } from "@/lib/access/processingAuthority";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { loadRelatedRecordProposalForCase, proposalNotFound } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";
import { rejectNewChildProposal } from "@/lib/pos/processingCase/commit/participantChildRequestCommit";

export const dynamic = "force-dynamic";

/**
 * Reject a proposed NEW child (operator-only). Nothing is created; the decision is recorded on the
 * case and, for a family's own request, on that request so the family view can say so.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string; proposalId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireProcessingCapability(ctx, PROCESSING_OPERATE);
    if (denied) return denied;
    const { caseId: rawCaseId, proposalId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    let body: { reason?: unknown } = {};
    try {
        body = (await request.json()) as { reason?: unknown };
    } catch {
        body = {};
    }
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;

    const supabase = createAdminClient();
    const { data: caseRow, error: caseError } = await supabase
        .from("processing_cases")
        .select("id, metadata")
        .eq("org_id", ctx.orgId)
        .eq("id", caseId)
        .maybeSingle();
    if (caseError) return jsonError(caseError.message, 500);
    if (!caseRow) return jsonError("Not found", 404);

    const context = await loadRelatedRecordProposalForCase({ supabase, orgId: ctx.orgId, caseId, proposalId });
    if (!context) return proposalNotFound({ supabase, orgId: ctx.orgId, caseId, proposalId });
    const isNewChild = context.proposal.origin === "proposed_new_record" && context.proposal.collection_provider_ref === "children";
    const isRelationship = context.proposal.execution_kind === "configured_relationship";
    const isHealthFact = context.proposal.execution_kind === "health_fact";
    if (!isNewChild && !isRelationship && !isHealthFact) {
        return jsonError("Only a proposed new child, relationship or health fact can be rejected here", 403);
    }

    const outcome = await rejectNewChildProposal(supabase, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        caseId,
        proposalId,
        metadata: ((caseRow as { metadata?: Record<string, unknown> | null }).metadata ?? {}) as Record<string, unknown>,
        reason,
        request: context.participantChildRequest ?? null,
        commitKind: isNewChild ? "new_child" : isHealthFact ? "health_fact" : "relationship",
    });
    if (!outcome.ok) return jsonError(outcome.error, outcome.status);
    return jsonData({ caseId, proposalId, rejected: true, alreadyDone: outcome.alreadyDone });
}
