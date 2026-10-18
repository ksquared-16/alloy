/**
 * PROCESSING COMMIT FOR A NEW CHILD A FAMILY TOLD US ABOUT.
 *
 * A participant may provide a child the school does not know yet (the Admissions packet's "Other
 * children in your household" collection is the canonical participant path: each member becomes a
 * `children` related-record proposal with origin `proposed_new_record`). Until now commit refused
 * every such proposal ("Only existing child proposals may commit in P5B"), so the child could only
 * be re-keyed by hand.
 *
 * This is the missing commit, and it creates nothing the Processing authority does not decide:
 *
 *   REVIEWED         an operator commits; the values come from the proposal, and the operator may
 *                    correct the name and date of birth first.
 *   ONCE             the idempotency key is the PROPOSAL alone — a retried or re-decided commit can
 *                    never create a second child; a stored result is returned instead.
 *   IDENTITY-SAFE    creation goes through `addChild`, the canonical identity-safe authority: a
 *                    possible match in the organization is REFUSED with its candidates until the
 *                    operator links the existing child or explicitly creates a new one with a reason.
 *   IN ITS HOUSEHOLD the child is created in the household the submission names, or the operator
 *                    links an existing child of that same household; never another household.
 *   AUDITED          `processing_related_record_proposal_committed`, with the identity outcome.
 *
 * Creating the child does not enroll them. Any Enrollment request is a separate, normal admissions
 * action.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { RelatedRecordInstanceProposal } from "@/lib/intake/proposals/types";
import { addChild, ChildIdentityChoiceRequiredError } from "@/lib/records/addChildService";
import { loadRelatedRecordProposalForCase, type RelatedRecordProposalCaseContext } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";
import {
    clearProposalCommitLockMetadata,
    isFreshCommitLock,
    mergeProposalCommitLockMetadata,
    mergeProposalCommitResultMetadata,
    processingProposalMetadata,
    type StoredProposalCommitResult,
} from "@/lib/pos/processingCase/commit/proposalMetadata";
import { emitEvent } from "@/lib/emitEvent";

export type NewChildIdentity = { firstName: string; lastName: string; dob: string | null };

export type NewChildIdentityChoice = {
    /** Operator corrections to what the family submitted. */
    readonly firstName?: string | null;
    readonly lastName?: string | null;
    readonly dob?: string | null;
    /** Link this existing child of the same household instead of creating one. */
    readonly chosenCustomerMemberId?: string | null;
    /** Create a new child even though possible matches exist — with a reason. */
    readonly createNewChild?: boolean;
    readonly createNewReason?: string | null;
};

export type NewChildCommitFailure = {
    ok: false;
    status: 403 | 404 | 409 | 422;
    error: string;
    candidates?: unknown[];
};

export type NewChildCommitSuccess = {
    ok: true;
    alreadyDone: boolean;
    result: StoredProposalCommitResult | (StoredProposalCommitResult & { identity_outcome: string });
    identity_outcome: string | null;
    audit_event_id: string | null;
};

/** The idempotency key for a new child: the proposal, and nothing a decision can change. */
export function newChildIdempotencyKey(proposalId: string): string {
    return `new_child:${proposalId}`;
}

function text(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * The child's name and date of birth from the proposal's own fields, operator corrections first.
 * Fields are recognised by their destination or source fact id (`…first_name`, `…last_name`,
 * `…full_name`, `…date_of_birth` / `…dob`); a full name splits at its last space.
 */
export function newChildIdentityFromProposal(
    proposal: Pick<RelatedRecordInstanceProposal, "field_proposals">,
    corrections: Pick<NewChildIdentityChoice, "firstName" | "lastName" | "dob"> = {},
): { ok: true; identity: NewChildIdentity } | { ok: false; error: string } {
    let first: string | null = null;
    let last: string | null = null;
    let full: string | null = null;
    let dob: string | null = null;
    for (const f of proposal.field_proposals) {
        const key = `${f.provider_ref ?? ""} ${f.source_fact_ref ?? ""}`.toLowerCase();
        const value = text(f.submitted_value);
        if (!value) continue;
        if (/first_name\b/.test(key)) first ??= value;
        else if (/last_name\b/.test(key)) last ??= value;
        else if (/full_name\b/.test(key)) full ??= value;
        else if (/(date_of_birth|\bdob)\b/.test(key)) dob ??= value;
    }
    if ((!first || !last) && full) {
        const parts = full.split(/\s+/);
        if (parts.length > 1) {
            first ??= parts.slice(0, -1).join(" ");
            last ??= parts[parts.length - 1]!;
        } else {
            first ??= full;
        }
    }
    const firstName = text(corrections.firstName) ?? first;
    const lastName = text(corrections.lastName) ?? last;
    const birth = text(corrections.dob) ?? dob;
    if (!firstName || !lastName) {
        return { ok: false, error: "A first and last name are required — correct the proposal before committing." };
    }
    if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) {
        return { ok: false, error: "The date of birth must be a date (YYYY-MM-DD)." };
    }
    return { ok: true, identity: { firstName, lastName, dob: birth } };
}

/** Only a valid new-child proposal, inside a known household, may commit here. */
export function verifyNewChildCommitAuthorization(args: {
    proposalId: string;
    proposalContext: RelatedRecordProposalCaseContext | null;
}): { ok: true; proposal: RelatedRecordInstanceProposal; customerId: string } | { ok: false; status: 403 | 404; error: string } {
    if (!args.proposalContext) return { ok: false, status: 404, error: "Proposal not found for case" };
    const proposal = args.proposalContext.proposal;
    if (proposal.proposal_id !== args.proposalId) return { ok: false, status: 404, error: "Proposal identity mismatch" };
    if (proposal.origin !== "proposed_new_record") return { ok: false, status: 403, error: "Only a proposed new child may commit here" };
    if (proposal.collection_provider_ref !== "children" || proposal.item_entity_type !== "customer_member") {
        return { ok: false, status: 403, error: "Only children proposals may commit here" };
    }
    if (proposal.status !== "valid") return { ok: false, status: 403, error: "Proposal is not valid" };
    const customerId = text(args.proposalContext.expectedCustomerId);
    if (!customerId) return { ok: false, status: 403, error: "The submission names no household, so no child can be created from it" };
    return { ok: true, proposal, customerId };
}

export async function executeNewChildProposalCommit(args: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    caseId: string;
    proposalId: string;
    metadata: Record<string, unknown>;
    choice: NewChildIdentityChoice;
    now?: string;
}): Promise<NewChildCommitSuccess | NewChildCommitFailure> {
    const now = args.now ?? new Date().toISOString();
    const idempotencyKey = newChildIdempotencyKey(args.proposalId);

    // ONCE: a committed proposal returns its stored result, whatever this request asks.
    const stored = processingProposalMetadata(args.metadata).commit_results?.[args.proposalId];
    if (stored && stored.idempotency_key === idempotencyKey && stored.record_id) {
        return { ok: true, alreadyDone: true, result: stored, identity_outcome: null, audit_event_id: stored.audit_event_id ?? null };
    }
    const lock = processingProposalMetadata(args.metadata).commit_locks?.[args.proposalId];
    if (isFreshCommitLock(lock)) {
        return { ok: false, status: 409, error: "Another commit is in progress for this proposal." };
    }

    const proposalContext = await loadRelatedRecordProposalForCase({
        supabase: args.supabase,
        orgId: args.orgId,
        caseId: args.caseId,
        proposalId: args.proposalId,
    });
    const auth = verifyNewChildCommitAuthorization({ proposalId: args.proposalId, proposalContext });
    if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };

    const identity = newChildIdentityFromProposal(auth.proposal, args.choice);
    if (!identity.ok) return { ok: false, status: 422, error: identity.error };

    // An explicitly chosen existing child must be an active child of THIS household.
    const chosen = text(args.choice.chosenCustomerMemberId);
    if (chosen) {
        const { data: member } = await args.supabase
            .from("customer_members")
            .select("id, customer_id, relationship, is_active")
            .eq("org_id", args.orgId)
            .eq("id", chosen)
            .maybeSingle();
        const m = member as { customer_id?: string | null; relationship?: string | null; is_active?: boolean | null } | null;
        if (!m || m.customer_id !== auth.customerId || m.relationship !== "child" || m.is_active !== true) {
            return { ok: false, status: 403, error: "The chosen child is not an active child of this household." };
        }
    }

    const withLock = mergeProposalCommitLockMetadata({
        metadata: args.metadata,
        proposalId: args.proposalId,
        lock: { idempotency_key: idempotencyKey, locked_at: now, locked_by: args.userId },
    });
    const { error: lockError } = await args.supabase.from("processing_cases").update({ metadata: withLock }).eq("org_id", args.orgId).eq("id", args.caseId);
    if (lockError) throw new Error(lockError.message);
    const release = async () => {
        await args.supabase
            .from("processing_cases")
            .update({ metadata: clearProposalCommitLockMetadata({ metadata: withLock, proposalId: args.proposalId }) })
            .eq("org_id", args.orgId)
            .eq("id", args.caseId);
    };

    let created: Awaited<ReturnType<typeof addChild>>;
    try {
        created = await addChild(args.supabase, {
            orgId: args.orgId,
            customerId: auth.customerId,
            customerMemberId: chosen,
            firstName: identity.identity.firstName,
            lastName: identity.identity.lastName,
            dob: identity.identity.dob,
            createNewChild: args.choice.createNewChild === true,
            createNewReason: text(args.choice.createNewReason),
        });
    } catch (e) {
        await release();
        if (e instanceof ChildIdentityChoiceRequiredError) {
            return { ok: false, status: 409, error: e.message, candidates: e.candidates };
        }
        throw e;
    }

    const auditEventId = await emitEvent({
        org_id: args.orgId,
        event_type: "processing_related_record_proposal_committed",
        entity_type: "customer_member",
        entity_id: created.customerMemberId,
        action_type: "processing_commit",
        occurred_at: now,
        payload: {
            processing_case_id: args.caseId,
            proposal_id: args.proposalId,
            commit_kind: "new_child",
            identity_outcome: created.identityOutcome,
            customer_id: created.customerId,
            operator_id: args.userId,
            corrected: Boolean(text(args.choice.firstName) || text(args.choice.lastName) || text(args.choice.dob)),
            create_new_reason: text(args.choice.createNewReason),
            idempotency_key: idempotencyKey,
        },
    });

    const result = {
        proposal_id: args.proposalId,
        record_id: created.customerMemberId,
        organization_id: args.orgId,
        status: "committed" as const,
        field_results: [],
        skipped_changes: [],
    };
    const latest = mergeProposalCommitResultMetadata({
        metadata: withLock,
        proposalId: args.proposalId,
        result,
        decisionVersion: "new_child",
        idempotencyKey,
        userId: args.userId,
        now,
        auditEventId,
    });
    const { error: resultError } = await args.supabase.from("processing_cases").update({ metadata: latest }).eq("org_id", args.orgId).eq("id", args.caseId);
    if (resultError) throw new Error(resultError.message);

    return {
        ok: true,
        alreadyDone: false,
        result: { ...result, committed_at: now, committed_by: args.userId, decision_version: "new_child", idempotency_key: idempotencyKey, audit_event_id: auditEventId, identity_outcome: created.identityOutcome },
        identity_outcome: created.identityOutcome,
        audit_event_id: auditEventId,
    };
}
