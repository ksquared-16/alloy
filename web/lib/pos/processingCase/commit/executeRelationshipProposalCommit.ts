/**
 * Commit an approved CONFIGURED RELATIONSHIP collection proposal through the guarded canonical path.
 *
 *   commit request
 *     → load the approved Processing proposal (org-scoped)
 *     → verifyRelationshipCommitAuthorization        ← the single gate; never reimplemented inline
 *     → server-resolved Relationship Definition
 *     → executeCommandInvocation (command runtime)
 *     → relationshipExecutionAdapter
 *     → executeRelationshipAction
 *     → compatibility writer selected by `persists_to`
 *
 * The caller may identify the proposal and request an ALLOWED scope override. It is never
 * authoritative for role, command, persistence destination, entities, direction or definition —
 * all of those are re-derived here, and conflicting assertions are rejected by the gate.
 *
 * Native structural collections (children, household members) never reach this module; the route
 * branches on `execution_kind` and keeps them on their existing native path.
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRelatedRecordProposalForCase } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";
import {
    verifyRelationshipCommitAuthorization,
    type RelationshipCommitRequest,
} from "@/lib/pos/processingCase/commit/verifyRelationshipCommitAuthorization";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import type { RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";

/** Structured commit outcomes surfaced to product consumers. */
export type RelationshipCommitOutcomeKind =
    | "applied"
    | "already_applied"
    | "rejected"
    | "stale"
    | "conflicted"
    | "failed";

/**
 * Explanation of a commit. Deliberately describes the relationship ABSTRACTION — the physical table
 * is exposed only as `persistence_destination` for developer diagnostics, never as product surface.
 */
export type RelationshipCommitRecord = {
    outcome: RelationshipCommitOutcomeKind;
    proposal_id: string;
    definition_key: string | null;
    person_id: string | null;
    role_key: string | null;
    scope: string | null;
    command_key: string | null;
    /** Developer diagnostic only. */
    persistence_destination: string | null;
    /** Canonical edge identity written (member ids the role now applies to). */
    affected_member_ids: string[];
    links_written: number | null;
    idempotency_key: string;
    actor_user_id: string | null;
    committed_at: string;
    reason: string | null;
    code: string | null;
};

export type RelationshipCommitOutcome =
    | { ok: true; status: 200; record: RelationshipCommitRecord }
    | { ok: false; status: number; record: RelationshipCommitRecord };

const LEDGER_KEY = "relationship_collection_commits";

function ledgerFrom(metadata: Record<string, unknown>): Record<string, RelationshipCommitRecord> {
    const raw = metadata[LEDGER_KEY];
    return raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, RelationshipCommitRecord>)
        : {};
}

/** Stable across retries of the same proposal + resolved semantics. */
function idempotencyKey(proposalId: string, commandKey: string, roleKey: string, scope: string): string {
    return `rel:${proposalId}:${commandKey}:${roleKey}:${scope}`;
}

/** Split a submitted full name into the Person draft shape, without inventing data. */
function personDraftFromFacts(
    facts: Array<{ entity_type: string; field_key: string; value: unknown }>,
): { first_name: string; last_name: string; email?: string; phone?: string } | null {
    const get = (key: string): string | undefined => {
        const hit = facts.find((f) => f.field_key === key);
        const v = hit?.value;
        return typeof v === "string" && v.trim() ? v.trim() : undefined;
    };
    const full = get("full_name");
    const first = get("first_name") ?? (full ? full.split(/\s+/)[0] : undefined);
    const last = get("last_name") ?? (full ? full.split(/\s+/).slice(1).join(" ") || full : undefined);
    if (!first || !last) return null;
    return { first_name: first, last_name: last, ...(get("email") ? { email: get("email") } : {}), ...(get("phone") ? { phone: get("phone") } : {}) };
}

export async function executeRelationshipProposalCommit(args: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string | null;
    actorRole: string;
    accessScope: unknown;
    caseId: string;
    proposalId: string;
    decision: RelatedRecordProposalDecision;
    metadata: Record<string, unknown>;
    /** Anchor the relationship attaches to — resolved from the case, never from the client. */
    anchorCustomerMemberId: string | null;
    /** Optional caller-supplied extras. Only `scope` is honoured; assertions are compared and rejected. */
    request?: Partial<RelationshipCommitRequest>;
}): Promise<RelationshipCommitOutcome> {
    const now = new Date().toISOString();
    const base = {
        proposal_id: args.proposalId,
        definition_key: null,
        person_id: null,
        role_key: null,
        scope: null,
        command_key: null,
        persistence_destination: null,
        affected_member_ids: [] as string[],
        links_written: null,
        idempotency_key: "",
        actor_user_id: args.userId,
        committed_at: now,
        reason: null,
        code: null,
    };

    const proposalContext = await loadRelatedRecordProposalForCase({
        supabase: args.supabase,
        orgId: args.orgId,
        caseId: args.caseId,
        proposalId: args.proposalId,
    });

    // THE GATE. All authorization lives in the module; nothing is re-checked inline here.
    const auth = verifyRelationshipCommitAuthorization({
        orgId: args.orgId,
        proposalId: args.proposalId,
        proposalContext,
        request: { proposalId: args.proposalId, ...args.request },
        instanceDecision: args.decision.instance_decision,
    });

    if (!auth.ok) {
        const outcome: RelationshipCommitOutcomeKind =
            auth.code === "proposal_stale" ? "stale"
            : auth.code === "proposal_not_approved" ? "rejected"
            : auth.status === 409 ? "conflicted"
            : "failed";
        return {
            ok: false,
            status: auth.status,
            record: { ...base, outcome, reason: auth.reason, code: auth.code },
        };
    }

    const { definition, resolved } = auth;
    const key = idempotencyKey(args.proposalId, resolved.commandKey, resolved.roleKey, resolved.scope);

    // IDEMPOTENCY — a retry of the same proposal under the same resolved semantics is a no-op.
    const prior = ledgerFrom(args.metadata)[key];
    if (prior && prior.outcome === "applied") {
        return { ok: true, status: 200, record: { ...prior, outcome: "already_applied" } };
    }

    const anchorCustomerId = proposalContext!.expectedCustomerId;
    if (!anchorCustomerId) {
        return {
            ok: false,
            status: 400,
            record: {
                ...base,
                outcome: "failed",
                definition_key: definition.definition_key,
                reason: "Case has no anchor household to attach the relationship to.",
                code: "missing_anchor_household",
            },
        };
    }

    // Identity: link the canonical Person when known, otherwise propose one from the submitted facts.
    const facts = auth.proposal.relationship_intent?.proposed_person_facts ?? [];
    const draft = resolved.identityAction === "create_proposed_person" ? personDraftFromFacts(facts) : null;
    if (resolved.identityAction === "create_proposed_person" && !draft) {
        return {
            ok: false,
            status: 400,
            record: {
                ...base,
                outcome: "failed",
                definition_key: definition.definition_key,
                reason: "Submitted response does not carry enough identity to propose a Person.",
                code: "insufficient_person_identity",
            },
        };
    }

    // Delegate through the command runtime → relationshipExecutionAdapter. Note what is NOT sent:
    // no roleKey (the adapter pins it from the definition-derived registry entry), no write target,
    // no executor selection.
    const result = await executeCommandInvocation({
        request: {
            invocation: {
                commandKey: resolved.commandKey,
                origin: "processing_commit",
                providedSubject: { entityType: "child", entityId: args.anchorCustomerMemberId ?? anchorCustomerId },
                inputValues: {
                    sourceEntityType: "child",
                    sourceRecordId: args.anchorCustomerMemberId ?? anchorCustomerId,
                    sourceCustomerId: anchorCustomerId,
                    anchorCustomerMemberId: args.anchorCustomerMemberId,
                    scope: resolved.scope,
                    ...(resolved.existingPersonId ? { selectedPersonId: resolved.existingPersonId } : {}),
                    ...(draft ? { createPersonDraft: draft } : {}),
                    confirmationRequired: true,
                },
            },
            mode: "execute",
            confirmation: { confirmed: true },
            executionSubject: { entityType: "child", entityId: args.anchorCustomerMemberId ?? anchorCustomerId },
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
        const code = "code" in result ? String(result.code ?? "relationship_execution_failed") : "relationship_execution_failed";
        const reason = "operatorMessage" in result ? String(result.operatorMessage ?? "Relationship execution failed.") : "Relationship execution failed.";
        return {
            ok: false,
            status: 400,
            record: {
                ...base,
                outcome: "failed",
                definition_key: definition.definition_key,
                role_key: resolved.roleKey,
                scope: resolved.scope,
                command_key: resolved.commandKey,
                persistence_destination: definition.persists_to,
                idempotency_key: key,
                reason,
                code,
            },
        };
    }

    const rel = (result as { relationshipResult?: Record<string, unknown> }).relationshipResult ?? {};
    const record: RelationshipCommitRecord = {
        outcome: "applied",
        proposal_id: args.proposalId,
        definition_key: definition.definition_key,
        person_id: typeof rel.person_id === "string" ? rel.person_id : (resolved.existingPersonId ?? null),
        role_key: typeof rel.role_key === "string" ? rel.role_key : resolved.roleKey,
        scope: resolved.scope,
        command_key: resolved.commandKey,
        persistence_destination: definition.persists_to,
        affected_member_ids: Array.isArray(rel.affected_children)
            ? (rel.affected_children as Array<{ customer_member_id?: string }>)
                  .map((c) => c.customer_member_id)
                  .filter((x): x is string => typeof x === "string")
            : [],
        links_written: typeof rel.links_written === "number" ? rel.links_written : null,
        idempotency_key: key,
        actor_user_id: args.userId,
        committed_at: now,
        reason: null,
        code: null,
    };

    // Persist the structured result on the case so retries and audit can read it.
    const ledger = { ...ledgerFrom(args.metadata), [key]: record };
    await args.supabase
        .from("processing_cases")
        .update({ metadata: { ...args.metadata, [LEDGER_KEY]: ledger } })
        .eq("org_id", args.orgId)
        .eq("id", args.caseId);

    return { ok: true, status: 200, record };
}
