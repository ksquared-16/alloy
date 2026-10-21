/**
 * THE PROCESSING DECISION ON A FAMILY'S NEW-CHILD REQUEST — commit or reject, once.
 *
 * The child itself is created only by `executeNewChildProposalCommit` (identity-safe `addChild`). This
 * module is what surrounds that commit when the proposal's source is a family's statement:
 *
 *   CLAIM      one operator commit at a time — an atomic compare-and-set on the request row, so two
 *              concurrent commits can never both reach `addChild`;
 *   REJECTED   a declined request can never be committed afterwards, and a committed one never declined;
 *   SETTLE     after the commit: the request records the one child it became, the case completes, and
 *              the family's Enrollment request is made (a REQUEST — `new_inquiry`, no offer, no
 *              Enrolling, no packet, no fee) — the cross-owner hand-off to Enrollment's own writer.
 *
 * Every step is idempotent, so a retried commit that finds the child already created finishes the rest.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { requestEnrollmentForExistingChild, type EnrollmentRequestResult } from "@/lib/enrollment/family/participantEnrollmentRequest";
import { dbCompleteProcessingCaseWithResult } from "@/lib/pos/processingCase/processingCaseDb";
import { mergeProposalDecisionMetadata, processingProposalMetadata } from "@/lib/pos/processingCase/commit/proposalMetadata";
import {
    PARTICIPANT_CHILD_REQUESTS_TABLE,
    recordParticipantChildRequestOutcome,
    type ParticipantChildRequestRow,
} from "@/lib/pos/processingCase/sources/participantChildRequest";
import { emitEvent } from "@/lib/emitEvent";

/** A claim older than this is abandoned (a crashed request) and may be taken over. */
export const PARTICIPANT_CHILD_REQUEST_CLAIM_TTL_MS = 2 * 60 * 1000;

export type ClaimResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly status: 409; readonly error: string; readonly code: "declined" | "in_progress" };

/** Atomically claim a PENDING request for one commit. A committed request is not claimed (the commit replays). */
export async function claimParticipantChildRequestForCommit(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly request: ParticipantChildRequestRow; readonly userId: string; readonly nowMs?: number },
): Promise<ClaimResult | { readonly ok: true; readonly alreadyCommitted: true }> {
    if (input.request.status === "committed") return { ok: true, alreadyCommitted: true };
    if (input.request.status === "declined") {
        return { ok: false, status: 409, code: "declined", error: "This request was rejected, so it cannot be committed." };
    }
    const now = input.nowMs ?? Date.now();
    const staleBefore = new Date(now - PARTICIPANT_CHILD_REQUEST_CLAIM_TTL_MS).toISOString();
    const { data, error } = await supabase
        .from(PARTICIPANT_CHILD_REQUESTS_TABLE)
        .update({ commit_claimed_at: new Date(now).toISOString(), commit_claimed_by: input.userId })
        .eq("org_id", input.orgId)
        .eq("id", input.request.id)
        .eq("status", "pending")
        .or(`commit_claimed_at.is.null,commit_claimed_at.lt.${staleBefore}`)
        .select("id");
    if (error) throw new Error(error.message);
    if ((data ?? []).length === 1) return { ok: true };
    return { ok: false, status: 409, code: "in_progress", error: "Another commit is in progress for this request." };
}

/** Release a claim that did not end in a child (e.g. the operator must choose between candidates). */
export async function releaseParticipantChildRequestClaim(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly requestId: string },
): Promise<void> {
    await supabase
        .from(PARTICIPANT_CHILD_REQUESTS_TABLE)
        .update({ commit_claimed_at: null, commit_claimed_by: null })
        .eq("org_id", input.orgId)
        .eq("id", input.requestId)
        .eq("status", "pending");
}

export type SettledParticipantChildRequest = {
    readonly requestStatus: string;
    readonly enrollmentRequest:
        | { readonly outcome: "requested"; readonly created: boolean }
        | { readonly outcome: "not_requested"; readonly reason: string };
};

function enrollmentOutcome(result: EnrollmentRequestResult): SettledParticipantChildRequest["enrollmentRequest"] {
    if (result.ok) return { outcome: "requested", created: result.created };
    return { outcome: "not_requested", reason: result.refusal.code };
}

/** After the child exists: record it on the request, complete the case, and make the Enrollment request. */
export async function settleParticipantChildRequestAfterCommit(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly userId: string;
        readonly caseId: string;
        readonly request: ParticipantChildRequestRow;
        readonly customerMemberId: string;
    },
): Promise<SettledParticipantChildRequest> {
    const recorded = await recordParticipantChildRequestOutcome(supabase, {
        orgId: input.orgId,
        requestId: input.request.id,
        userId: input.userId,
        outcome: { status: "committed", customerMemberId: input.customerMemberId },
    });
    await completeCaseOnce(supabase, input.orgId, input.caseId, {
        kind: "participant_child_request",
        outcome: "committed",
        participant_child_request_id: input.request.id,
        customer_member_id: input.customerMemberId,
    });
    const enrollment = await requestEnrollmentForExistingChild(supabase, {
        orgId: input.orgId,
        customerId: input.request.customer_id,
        opportunityId: input.request.opportunity_id,
        customerMemberId: input.customerMemberId,
    });
    return {
        requestStatus: recorded.status ?? "unknown",
        // A child already being considered (a replayed settle) is the request already made.
        enrollmentRequest: !enrollment.ok && enrollment.refusal.code === "already_active"
            ? { outcome: "requested", created: false }
            : enrollmentOutcome(enrollment),
    };
}

async function completeCaseOnce(supabase: SupabaseClient, orgId: string, caseId: string, result: object): Promise<void> {
    const { data } = await supabase.from("processing_cases").select("status").eq("org_id", orgId).eq("id", caseId).maybeSingle();
    const status = (data as { status?: string } | null)?.status;
    if (status === "completed" || status === "archived") return;
    await dbCompleteProcessingCaseWithResult(supabase, { orgId, caseId, result });
}

export type RejectNewChildProposalResult =
    | { readonly ok: true; readonly alreadyDone: boolean }
    | { readonly ok: false; readonly status: 404 | 409; readonly error: string };

/**
 * Reject a family's new-child proposal: nothing is created, the decision is recorded on the case (and on
 * the family's request when that is the source), and a committed proposal can no longer be rejected.
 */
export async function rejectNewChildProposal(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly userId: string;
        readonly caseId: string;
        readonly proposalId: string;
        readonly metadata: Record<string, unknown>;
        readonly reason: string | null;
        readonly request: ParticipantChildRequestRow | null;
        /** What is being rejected: a proposed new child, or a proposed relationship (guardian, contact…). */
        readonly commitKind?: "new_child" | "relationship" | "health_fact" | "person_contact_facts";
        readonly now?: string;
    },
): Promise<RejectNewChildProposalResult> {
    const now = input.now ?? new Date().toISOString();
    const stored = processingProposalMetadata(input.metadata);
    if (stored.commit_results?.[input.proposalId]?.record_id || input.request?.status === "committed") {
        return { ok: false, status: 409, error: "This child has already been committed, so the proposal cannot be rejected." };
    }
    if (relationshipAlreadyApplied(input.metadata, input.proposalId)) {
        return { ok: false, status: 409, error: "This relationship has already been committed, so the proposal cannot be rejected." };
    }
    {
        for (const key of ["health_fact_commits", "medical_consent_commits"]) {
            const ledger = (input.metadata as Record<string, unknown>)[key];
            if (ledger && typeof ledger === "object" && (ledger as Record<string, unknown>)[input.proposalId]) {
                return { ok: false, status: 409, error: "This has already been recorded on the child's Medical record, so the proposal cannot be rejected." };
            }
        }
        const facts = (input.metadata as Record<string, unknown>).person_contact_fact_commits;
        if (facts && typeof facts === "object" && (facts as Record<string, unknown>)[input.proposalId]) {
            return { ok: false, status: 409, error: "These details have already been recorded on the parent's record, so the proposal cannot be rejected." };
        }
    }
    const already = stored.decisions?.[input.proposalId]?.instance_decision === "reject";

    if (input.request) {
        const recorded = await recordParticipantChildRequestOutcome(supabase, {
            orgId: input.orgId,
            requestId: input.request.id,
            userId: input.userId,
            outcome: { status: "declined", reason: input.reason },
        });
        if (!recorded.ok) return { ok: false, status: 409, error: "This request has already been decided." };
    }
    if (!already) {
        const metadata = mergeProposalDecisionMetadata({
            metadata: input.metadata,
            proposalId: input.proposalId,
            decision: { proposal_id: input.proposalId, instance_decision: "reject", field_decisions: [] },
            decisionVersion: input.commitKind ?? "new_child",
            userId: input.userId,
            now,
        });
        const { error } = await supabase.from("processing_cases").update({ metadata }).eq("org_id", input.orgId).eq("id", input.caseId);
        if (error) throw new Error(error.message);
        await emitEvent({
            org_id: input.orgId,
            event_type: "processing_related_record_proposal_rejected",
            entity_type: "processing_case",
            entity_id: input.caseId,
            action_type: "processing_reject",
            occurred_at: now,
            payload: {
                processing_case_id: input.caseId,
                proposal_id: input.proposalId,
                commit_kind: input.commitKind ?? "new_child",
                operator_id: input.userId,
                reason: input.reason,
                participant_child_request_id: input.request?.id ?? null,
            },
        });
    }
    if (input.request) {
        await completeCaseOnce(supabase, input.orgId, input.caseId, {
            kind: "participant_child_request",
            outcome: "declined",
            participant_child_request_id: input.request.id,
        });
    }
    return { ok: true, alreadyDone: already };
}

/** A rejected proposal never commits. */
export function isRejectedProposal(metadata: unknown, proposalId: string): boolean {
    return processingProposalMetadata(metadata).decisions?.[proposalId]?.instance_decision === "reject";
}

/** A relationship proposal the canonical relationship ledger already applied (any anchor, any revision). */
export function relationshipAlreadyApplied(metadata: unknown, proposalId: string): boolean {
    const ledger = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).relationship_collection_commits : null;
    if (!ledger || typeof ledger !== "object") return false;
    return Object.values(ledger as Record<string, { proposal_id?: string; outcome?: string }>).some(
        (r) => r?.proposal_id === proposalId && (r.outcome === "applied" || r.outcome === "already_applied"),
    );
}
