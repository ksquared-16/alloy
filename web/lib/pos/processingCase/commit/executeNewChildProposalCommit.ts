/**
 * A SIBLING THE FAMILY ADDED BECOMES A CANONICAL CHILD — after an operator says so.
 *
 * ## What this is, and what it deliberately is not
 *
 * The repeated-party pipeline already produced and reviewed a respondent-added child proposal
 * correctly; there was simply no way to act on one. `buildExistingChildCommitPlan` refuses any
 * `origin !== "existing_record"` — "Only existing child proposals may commit in P5B" — and that
 * refusal is CORRECT for what that plan means: reconciling changes onto a child Alloy already
 * holds. Creating one is a different act, so it gets its own plan rather than a loosened old one.
 *
 * This module writes nothing. It resolves the approved proposal into the inputs of the REGISTERED
 * `add_child` capability and invokes it through the command runtime. Alloy already has exactly one
 * child-member write authority (`createHouseholdChildMember`, reached through
 * `executeRelationshipAction`), and it already asks before it writes, so a child already on the
 * household is reused rather than raced into existence. Processing is the approval and
 * orchestration layer over that authority — never a second one.
 *
 * ## The approval boundary
 *
 * No canonical child exists because a participant clicked Add, because they submitted, because a
 * proposal was generated, or because a case opened. It exists only after an operator's explicit
 * `approve` on this proposal. That is enforced here, before anything is resolved.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import type { RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";
import { loadRelatedRecordProposalForCase } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";
import {
    loadResolvedProcessingCaseContext,
    resolveCommitHousehold,
} from "@/lib/pos/processingCase/commit/loadResolvedProcessingCaseContext";

export type NewChildCommitOutcomeKind =
    | "applied"
    | "already_applied"
    | "rejected"
    | "failed"
    | "stale"
    | "conflicted";

export type NewChildCommitRecord = {
    outcome: NewChildCommitOutcomeKind;
    proposal_id: string;
    command_key: string | null;
    apply_scope: string | null;
    /** The canonical household child this commit produced or reused. */
    customer_member_id: string | null;
    person_id: string | null;
    links_written: number | null;
    idempotency_key: string;
    actor_user_id: string | null;
    committed_at: string;
    reason: string | null;
    code: string | null;
    resolution_revision?: string | null;
    resolved_customer_id?: string | null;
    /** Where this child came from, carried onto the audit record. */
    source_lineage?: Record<string, string> | null;
};

export type NewChildCommitOutcome =
    | { ok: true; status: 200; record: NewChildCommitRecord }
    | { ok: false; status: number; record: NewChildCommitRecord };

const LEDGER_KEY = "child_membership_commits";

function ledgerFrom(metadata: Record<string, unknown>): Record<string, NewChildCommitRecord> {
    const raw = metadata[LEDGER_KEY];
    return raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, NewChildCommitRecord>)
        : {};
}

/**
 * Stable across retries of the same approved proposal against the same household.
 *
 * The household is part of the identity for the same reason the anchor is on the relationship side:
 * the same proposal committed into a DIFFERENT family is a different act, never a retry.
 */
function idempotencyKey(proposalId: string, commandKey: string, customerId: string): string {
    return `child:${proposalId}:${commandKey}:${customerId}`;
}

/** The identity `add_child` requires: a first and last name. Date of birth is optional. */
export function childDraftFromFacts(
    facts: ReadonlyArray<{ entity_type: string; field_key: string; value: unknown }>,
): { first_name: string; last_name: string; date_of_birth?: string } | null {
    const get = (key: string): string | undefined => {
        const hit = facts.find((f) => f.field_key === key);
        const v = hit?.value;
        return typeof v === "string" && v.trim() ? v.trim() : undefined;
    };
    const full = get("full_name");
    const first = get("first_name") ?? (full ? full.split(/\s+/)[0] : undefined);
    const last = get("last_name") ?? (full ? full.split(/\s+/).slice(1).join(" ") || full : undefined);
    if (!first || !last) return null;
    const dob = get("date_of_birth") ?? get("dob");
    return { first_name: first, last_name: last, ...(dob ? { date_of_birth: dob } : {}) };
}

export async function executeNewChildProposalCommit(args: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string | null;
    actorRole: string;
    accessScope: unknown;
    caseId: string;
    proposalId: string;
    decision: RelatedRecordProposalDecision;
    metadata: Record<string, unknown>;
    expectedResolutionRevision?: string | null;
    /** Resolve and authorize without writing — the preview runs the identical gate. */
    previewOnly?: boolean;
    now?: string;
}): Promise<NewChildCommitOutcome> {
    const now = args.now ?? new Date().toISOString();
    const base: NewChildCommitRecord = {
        outcome: "failed",
        proposal_id: args.proposalId,
        command_key: null,
        apply_scope: null,
        customer_member_id: null,
        person_id: null,
        links_written: null,
        idempotency_key: "",
        actor_user_id: args.userId,
        committed_at: now,
        reason: null,
        code: null,
    };
    const fail = (status: number, code: string, reason: string, outcome: NewChildCommitOutcomeKind = "failed") =>
        ({ ok: false as const, status, record: { ...base, outcome, code, reason } });

    const proposalContext = await loadRelatedRecordProposalForCase({
        supabase: args.supabase,
        orgId: args.orgId,
        caseId: args.caseId,
        proposalId: args.proposalId,
    });
    if (!proposalContext) return fail(404, "proposal_not_found", "Proposal not found for case");

    const proposal = proposalContext.proposal;

    // ── the approval boundary, before anything is resolved ───────────────────────────────────────
    if (args.decision.instance_decision !== "approve") {
        return fail(403, "proposal_not_approved", "Creating a child requires an approved proposal decision.", "rejected");
    }

    const intent = proposal.membership_intent;
    if (!intent) {
        return fail(400, "membership_intent_missing", "This proposal does not declare household membership.");
    }
    if (intent.identity_action !== "create_household_child") {
        return fail(
            403,
            "not_a_new_child_proposal",
            "This proposal references a child Alloy already holds; commit it through the existing-child path.",
        );
    }
    if (proposal.existing_record_id) {
        return fail(403, "not_a_new_child_proposal", "A proposal carrying an existing child id cannot create one.");
    }
    if (proposal.status !== "valid") {
        return fail(409, "proposal_not_valid", "Only a valid proposal can be committed.", "conflicted");
    }

    // ── household authority: the SAME reading the relationship commit uses ───────────────────────
    const caseContext = await loadResolvedProcessingCaseContext(args.supabase, {
        orgId: args.orgId,
        caseId: args.caseId,
    });
    const household = resolveCommitHousehold({
        context: caseContext,
        submissionCustomerId: proposalContext.expectedCustomerId,
        expectedRevision: args.expectedResolutionRevision ?? null,
    });
    if (!household.ok) {
        return {
            ok: false,
            status: household.status,
            record: {
                ...base,
                outcome: household.code === "resolution_stale" ? "stale" : household.code === "resolution_conflict" ? "conflicted" : "failed",
                reason: household.reason,
                code: household.code,
                resolution_revision: caseContext?.resolution_revision ?? null,
            },
        };
    }
    const customerId = household.customer_id;

    const key = idempotencyKey(args.proposalId, intent.apply_command_key, customerId);
    const prior = ledgerFrom(args.metadata)[key];
    if (prior && prior.outcome === "applied") {
        return { ok: true, status: 200, record: { ...prior, outcome: "already_applied" } };
    }

    const subjectOpportunityId = (proposalContext.expectedOpportunityId ?? "").trim();
    if (!subjectOpportunityId) {
        return fail(
            400,
            "no_subject_record",
            "This submission names no enrollment record to act against.",
        );
    }

    const draft = childDraftFromFacts(intent.proposed_child_facts);
    if (!draft) {
        return fail(
            400,
            "insufficient_child_identity",
            "The approved response does not carry enough identity to create a child.",
        );
    }

    const lineage: Record<string, string> = {
        form_submission_id: proposalContext.provenance.formSubmissionId,
        ...(proposalContext.provenance.formDefinitionVersionId
            ? { form_definition_version_id: proposalContext.provenance.formDefinitionVersionId }
            : {}),
        ...(proposalContext.provenance.packetSessionId ? { packet_session_id: proposalContext.provenance.packetSessionId } : {}),
        ...(proposalContext.provenance.packetStepIndex === null || proposalContext.provenance.packetStepIndex === undefined
            ? {}
            : { packet_step_index: String(proposalContext.provenance.packetStepIndex) }),
        instance_key: proposal.instance_key,
    };

    const resolved: NewChildCommitRecord = {
        ...base,
        command_key: intent.apply_command_key,
        apply_scope: intent.apply_scope,
        idempotency_key: key,
        resolution_revision: household.revision,
        resolved_customer_id: customerId,
        source_lineage: lineage,
    };

    if (args.previewOnly) {
        return { ok: true, status: 200, record: { ...resolved, outcome: "applied" } };
    }

    /*
     * Delegate through the command runtime → relationshipExecutionAdapter → the registered
     * `add_child` capability. Note what is NOT sent: no table, no executor selection, no member id.
     * `household` scope is the intent's, not the caller's, so this can never be steered onto an
     * opportunity participation write.
     */
    const result = await executeCommandInvocation({
        request: {
            invocation: {
                commandKey: intent.apply_command_key,
                origin: "processing_commit",
                /*
                 * The SUBJECT is the enrollment opportunity the packet was launched from — the
                 * operator-facing record this case descends from. The adapter recognises
                 * `child | person | opportunity` and nothing else, and a household is none of
                 * them: the household travels as `sourceCustomerId`, which is what
                 * `executeRelationshipAction` actually requires and what `household` scope writes
                 * against. MEASURED before this: passing the customer as the subject was refused
                 * `Unsupported source entity type "customer"`.
                 *
                 * The opportunity is the subject, NOT the destination. `household` scope is what
                 * decides where the child lands, and the capability's opportunity-participation
                 * branch runs only under `this_opportunity` — so naming the opportunity here
                 * cannot quietly enroll the sibling in it.
                 */
                providedSubject: { entityType: "opportunity", entityId: subjectOpportunityId },
                inputValues: {
                    sourceEntityType: "opportunity",
                    sourceRecordId: subjectOpportunityId,
                    sourceCustomerId: customerId,
                    scope: intent.apply_scope,
                    createChildDraft: draft,
                    confirmationRequired: true,
                },
            },
            mode: "execute",
            confirmation: { confirmed: true },
            executionSubject: { entityType: "opportunity", entityId: subjectOpportunityId },
        },
        server: {
            orgId: args.orgId,
            userId: args.userId,
            actorRole: args.actorRole,
            accessScope: args.accessScope,
            supabase: args.supabase,
        },
    } as never);

    if (!result.ok) {
        /*
         * The runtime's refusal, as the runtime states it.
         *
         * `code` and `operatorMessage` live under `error`, with any further detail in
         * `diagnostics`. Reading the top level yields a generic "Child creation failed." that tells
         * an operator nothing about why — which is exactly what the first live run of this path
         * produced, and exactly the wrong thing to leave in front of someone deciding whether to
         * retry.
         */
        const failure = result as {
            error?: { code?: string; operatorMessage?: string };
            diagnostics?: readonly { code?: string; message?: string }[];
        };
        const code = failure.error?.code ?? "child_execution_failed";
        const detail = (failure.diagnostics ?? [])
            .map((d) => d?.message)
            .filter((m): m is string => Boolean(m))
            .join("; ");
        const reason = failure.error?.operatorMessage ?? detail ?? "Child creation failed.";
        return {
            ok: false,
            status: 400,
            record: { ...resolved, outcome: "failed", reason: detail && detail !== reason ? `${reason} (${detail})` : reason, code },
        };
    }

    const rel = (result as { relationshipResult?: Record<string, unknown> }).relationshipResult ?? {};
    const record: NewChildCommitRecord = {
        ...resolved,
        outcome: "applied",
        customer_member_id: typeof rel.customer_member_id === "string" ? rel.customer_member_id : null,
        person_id: typeof rel.person_id === "string" ? rel.person_id : null,
        links_written: typeof rel.links_written === "number" ? rel.links_written : null,
    };

    const ledger = { ...ledgerFrom(args.metadata), [key]: record };
    await args.supabase
        .from("processing_cases")
        .update({ metadata: { ...args.metadata, [LEDGER_KEY]: ledger } })
        .eq("org_id", args.orgId)
        .eq("id", args.caseId);

    return { ok: true, status: 200, record };
}
