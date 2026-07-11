import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import type { RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";
import { normalizeProposalDecision } from "@/lib/intake/proposals/decisions";
import { executeExistingChildProposalCommit } from "@/lib/pos/processingCase/commit/executeExistingChildProposalCommit";

export const dynamic = "force-dynamic";

type Body = { decision?: RelatedRecordProposalDecision };

function parseDecision(body: Body, proposalId: string): RelatedRecordProposalDecision | NextResponse {
    const decision = body.decision;
    if (!decision || typeof decision !== "object") return jsonError("Missing decision", 400);
    if (decision.proposal_id !== proposalId) return jsonError("Decision proposal_id mismatch", 400);
    if (!Array.isArray(decision.field_decisions)) return jsonError("field_decisions must be an array", 400);
    return normalizeProposalDecision(decision);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string; proposalId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { caseId: rawCaseId, proposalId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    let body: Body;
    try {
        body = (await request.json()) as Body;
    } catch {
        return jsonError("Invalid JSON body", 400);
    }
    const decision = parseDecision(body, proposalId);
    if (decision instanceof NextResponse) return decision;

    const supabase = createAdminClient();

    try {
        const { data: caseRow, error: caseError } = await supabase
            .from("processing_cases")
            .select("id, metadata")
            .eq("org_id", ctx.orgId)
            .eq("id", caseId)
            .maybeSingle();
        if (caseError) throw new Error(caseError.message);
        if (!caseRow) return jsonError("Not found", 404);

        const metadata = ((caseRow as { metadata?: Record<string, unknown> | null }).metadata ?? {}) as Record<string, unknown>;
        const outcome = await executeExistingChildProposalCommit({
supabase,
            orgId: ctx.orgId,
            userId: ctx.userId,
            caseId,
            proposalId,
            decision,
            metadata,
        });
        if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });

        return jsonData({
            caseId,
            proposalId,
            alreadyDone: Boolean(outcome.alreadyDone),
            preview: outcome.preview,
            plan: {
                approved_changes: outcome.preview.approved_changes,
                skipped_changes: outcome.preview.skipped_changes,
            },
            result: outcome.result,
            idempotency_key: outcome.idempotency_key,
            decision_version: outcome.decision_version,
            audit_event_id: outcome.audit_event_id ?? null,
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to commit proposal" }, { status: 500 });
    }
}
