import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import type { RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";
import { normalizeProposalDecision } from "@/lib/intake/proposals/decisions";
import { previewExistingChildProposalCommit } from "@/lib/pos/processingCase/commit/executeExistingChildProposalCommit";
import { executeRelationshipProposalCommit } from "@/lib/pos/processingCase/commit/executeRelationshipProposalCommit";
import { loadRelatedRecordProposalForCase } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";

export const dynamic = "force-dynamic";

type Body = {
    decision?: RelatedRecordProposalDecision;
    scope?: string;
    anchor_customer_member_id?: string;
    selected_customer_member_ids?: unknown[];
    asserted_role_key?: string;
    asserted_command_key?: string;
    expected_proposal_status?: string;
    /** The case resolution the operator reviewed; a change since then is stale. */
    expected_resolution_revision?: string;
};

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
        // Same execution split as commit: a preview must exercise the identical gate, or it is not a
        // preview of what will happen. Classification failure falls through to the native path.
        let proposalContext: Awaited<ReturnType<typeof loadRelatedRecordProposalForCase>> = null;
        try {
            proposalContext = await loadRelatedRecordProposalForCase({ supabase, orgId: ctx.orgId, caseId, proposalId });
        } catch {
            proposalContext = null;
        }
        if (proposalContext?.proposal.execution_kind === "configured_relationship") {
            const relPreview = await executeRelationshipProposalCommit({
                supabase,
                orgId: ctx.orgId,
                userId: ctx.userId ?? null,
                actorRole: ctx.role,
                accessScope: (ctx as { accessScope?: unknown }).accessScope,
                caseId,
                proposalId,
                decision,
                metadata,
                anchorCustomerMemberId:
                    typeof body.anchor_customer_member_id === "string" ? body.anchor_customer_member_id : null,
                selectedCustomerMemberIds: Array.isArray(body.selected_customer_member_ids)
                    ? body.selected_customer_member_ids.filter((x): x is string => typeof x === "string")
                    : null,
                previewOnly: true,
                expectedResolutionRevision:
                    typeof body.expected_resolution_revision === "string" ? body.expected_resolution_revision : null,
                request: {
                    proposalId,
                    ...(typeof body.scope === "string" ? { scope: body.scope } : {}),
                    ...(typeof body.asserted_role_key === "string" ? { assertedRoleKey: body.asserted_role_key } : {}),
                    ...(typeof body.asserted_command_key === "string" ? { assertedCommandKey: body.asserted_command_key } : {}),
                    ...(typeof body.expected_proposal_status === "string"
                        ? { expectedProposalStatus: body.expected_proposal_status }
                        : {}),
                },
            });
            const payload = { caseId, proposalId, decision_version: relPreview.record.idempotency_key, ...relPreview.record };
            return relPreview.ok
                ? jsonData(payload)
                : NextResponse.json({ error: relPreview.record.reason, ...payload }, { status: relPreview.status });
        }

        const outcome = await previewExistingChildProposalCommit({
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
            preview: outcome.preview,
            alreadyDone: Boolean(outcome.alreadyDone),
            stored_result: outcome.stored_result ?? null,
            idempotency_key: outcome.idempotency_key,
            decision_version: outcome.decision_version,
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to preview proposal commit" }, { status: 500 });
    }
}
