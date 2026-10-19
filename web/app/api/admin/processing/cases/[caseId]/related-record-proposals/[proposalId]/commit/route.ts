import { NextRequest, NextResponse } from "next/server";
import { executeNewChildProposalCommit } from "@/lib/pos/processingCase/commit/executeNewChildProposalCommit";
import {
    claimParticipantChildRequestForCommit,
    isRejectedProposal,
    releaseParticipantChildRequestClaim,
    settleParticipantChildRequestAfterCommit,
} from "@/lib/pos/processingCase/commit/participantChildRequestCommit";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { PROCESSING_OPERATE, requireProcessingCapability } from "@/lib/access/processingAuthority";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import type { RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";
import { normalizeProposalDecision } from "@/lib/intake/proposals/decisions";
import { executeExistingChildProposalCommit } from "@/lib/pos/processingCase/commit/executeExistingChildProposalCommit";
import { executeRelationshipProposalCommit } from "@/lib/pos/processingCase/commit/executeRelationshipProposalCommit";
import { loadRelatedRecordProposalForCase } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";
import {
    isProcessingCaseSubjectRemoved,
    PROCESSING_SUBJECT_REMOVED_FIELD,
    processingSubjectRemovedResponse,
} from "@/lib/pos/processingCase/processingCaseSubjectRemoved";

export const dynamic = "force-dynamic";

type Body = {
    decision?: RelatedRecordProposalDecision;
    /** New-child commit: operator corrections and the identity choice (see executeNewChildProposalCommit). */
    new_child?: unknown;
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
    /** The operator's choice of an existing person — validated by the relationship authority. */
    selected_person_id?: string;
    /** The operator's corrections to the submitted person before it is created. */
    person_corrections?: unknown;
    /** The operator confirmed the submitted person is NOT the same-name person already in this family. */
    confirm_new_person?: boolean;
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
    const denied = requireProcessingCapability(ctx, PROCESSING_OPERATE);
    if (denied) return denied;
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
            .select(`id, metadata, ${PROCESSING_SUBJECT_REMOVED_FIELD}`)
            .eq("org_id", ctx.orgId)
            .eq("id", caseId)
            .maybeSingle();
        if (caseError) throw new Error(caseError.message);
        if (!caseRow) return jsonError("Not found", 404);
        if (isProcessingCaseSubjectRemoved(caseRow)) return processingSubjectRemovedResponse();

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
        // A NEW child the family told us about: reviewed, identity-safe creation through the
        // Processing new-child commit. Existing-child and relationship paths are unchanged.
        if (
            proposalContext?.proposal.origin === "proposed_new_record" &&
            proposalContext.proposal.collection_provider_ref === "children"
        ) {
            const nc = (body.new_child && typeof body.new_child === "object" ? body.new_child : {}) as Record<string, unknown>;
            const str = (v: unknown) => (typeof v === "string" ? v : null);
            if (isRejectedProposal(metadata, proposalId)) {
                return NextResponse.json({ error: "This proposal was rejected, so it cannot be committed.", code: "declined" }, { status: 409 });
            }
            // A family's own request: one commit at a time (atomic claim on the request row).
            const request = proposalContext.participantChildRequest ?? null;
            let claimed = false;
            if (request) {
                const claim = await claimParticipantChildRequestForCommit(supabase, { orgId: ctx.orgId, request, userId: ctx.userId });
                if (!claim.ok) return NextResponse.json({ error: claim.error, code: claim.code }, { status: claim.status });
                claimed = !("alreadyCommitted" in claim);
            }
            const release = async () => {
                if (claimed && request) await releaseParticipantChildRequestClaim(supabase, { orgId: ctx.orgId, requestId: request.id });
            };
            let outcome: Awaited<ReturnType<typeof executeNewChildProposalCommit>>;
            try {
                outcome = await executeNewChildProposalCommit({
                    supabase,
                    orgId: ctx.orgId,
                    userId: ctx.userId,
                    caseId,
                    proposalId,
                    metadata,
                    choice: {
                        firstName: str(nc.first_name),
                        lastName: str(nc.last_name),
                        dob: str(nc.dob),
                        chosenCustomerMemberId: str(nc.chosen_customer_member_id),
                        createNewChild: nc.create_new_child === true,
                        createNewReason: str(nc.create_new_reason),
                    },
                });
            } catch (e) {
                await release();
                throw e;
            }
            if (!outcome.ok) {
                await release();
                return NextResponse.json(
                    { error: outcome.error, ...(outcome.candidates ? { candidates: outcome.candidates } : {}) },
                    { status: outcome.status },
                );
            }
            // The family's request records the one child it became, the case completes, and the
            // family's Enrollment REQUEST is made (never an offer, Enrolling, packet or fee).
            const recordId = (outcome.result as { record_id?: string | null }).record_id ?? null;
            const settled = request && recordId
                ? await settleParticipantChildRequestAfterCommit(supabase, { orgId: ctx.orgId, userId: ctx.userId, caseId, request, customerMemberId: recordId })
                : null;
            return jsonData({
                caseId,
                proposalId,
                alreadyDone: outcome.alreadyDone,
                result: outcome.result,
                identity_outcome: outcome.identity_outcome,
                audit_event_id: outcome.audit_event_id,
                participant_child_request: settled,
            });
        }

        if (proposalContext?.proposal.execution_kind === "configured_relationship") {
            // A rejected relationship never commits (the decision is recorded by the reject route).
            if (isRejectedProposal(metadata, proposalId)) {
                return NextResponse.json({ error: "This proposal was rejected, so it cannot be committed.", code: "declined" }, { status: 409 });
            }

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
                selectedPersonId: typeof body.selected_person_id === "string" && body.selected_person_id.trim() ? body.selected_person_id.trim() : null,
                personCorrections: body.person_corrections && typeof body.person_corrections === "object" && !Array.isArray(body.person_corrections)
                    ? (body.person_corrections as { first_name?: string | null; last_name?: string | null; phone?: string | null; email?: string | null })
                    : null,
                confirmNewPerson: body.confirm_new_person === true,
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
