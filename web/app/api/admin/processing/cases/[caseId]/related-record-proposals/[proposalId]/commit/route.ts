import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import type { RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";
import { normalizeProposalDecision } from "@/lib/intake/proposals/decisions";
import { executeExistingChildProposalCommit } from "@/lib/pos/processingCase/commit/executeExistingChildProposalCommit";
import { executeRelationshipProposalCommit } from "@/lib/pos/processingCase/commit/executeRelationshipProposalCommit";
import { loadRelatedRecordProposalForCase } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";

export const dynamic = "force-dynamic";

type Body = {
    decision?: RelatedRecordProposalDecision;
    /** Allowed: an operator scope override, validated against the definition's supported scopes. */
    scope?: string;
    /** Optional assertions — compared against the server's answer and REJECTED on conflict. */
    asserted_role_key?: string;
    asserted_command_key?: string;
    expected_proposal_status?: string;
    /** The case resolution the operator reviewed; a change since then is stale. */
    expected_resolution_revision?: string;
    /** Explicit child anchor — validated against the server-loaded household. */
    anchor_customer_member_id?: string;
    /** Explicit selection for selected-children scope — every id is validated. */
    selected_customer_member_ids?: unknown[];
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

        // ── execution split (server-derived; the DEFINITION decides) ─────────────────────────────
        //   native_structural       → the existing native structural commit path, unchanged
        //   configured_relationship → guarded relationship path: approved proposal → authorization
        //                             gate → definition → command runtime → relationshipExecutionAdapter
        // @see docs/platform/core/data/relationship-model.md
        // Classification must never be able to break the native path: if the proposal cannot be
        // loaded or classified, fall through to the existing native commit, which performs its own
        // authorization. Only a POSITIVE `configured_relationship` classification diverts.
        let proposalContext: Awaited<ReturnType<typeof loadRelatedRecordProposalForCase>> = null;
        try {
            proposalContext = await loadRelatedRecordProposalForCase({
                supabase,
                orgId: ctx.orgId,
                caseId,
                proposalId,
            });
        } catch {
            proposalContext = null;
        }
        if (proposalContext?.proposal.execution_kind === "configured_relationship") {

            const relOutcome = await executeRelationshipProposalCommit({
                supabase,
                orgId: ctx.orgId,
                userId: ctx.userId ?? null,
                actorRole: ctx.role,
                accessScope: (ctx as { accessScope?: unknown }).accessScope,
                caseId,
                proposalId,
                decision,
                metadata,
                expectedResolutionRevision:
                    typeof body.expected_resolution_revision === "string" ? body.expected_resolution_revision : null,
                // The proposal context carries the household, not a specific child member. With a
                // null anchor the executor resolves scope across the household's children, which is
                // correct for household-scoped commits; child-specific anchoring is supplied by the
                // caller's scope choice. Resolving a precise anchor member is a live-journey concern.
                // The anchor is an explicit operator/runtime choice. It is validated against the
                // household above; it is never inferred from "the only child" and never expanded.
                anchorCustomerMemberId:
                    typeof body.anchor_customer_member_id === "string" ? body.anchor_customer_member_id : null,
                selectedCustomerMemberIds: Array.isArray(body.selected_customer_member_ids)
                    ? body.selected_customer_member_ids.filter((x): x is string => typeof x === "string")
                    : null,
                // Only `scope` is honoured; role/command assertions are compared and rejected by the gate.
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
            const payload = { caseId, proposalId, ...relOutcome.record };
            return relOutcome.ok
                ? jsonData(payload)
                : NextResponse.json({ error: relOutcome.record.reason, ...payload }, { status: relOutcome.status });
        }

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
