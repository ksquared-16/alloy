/**
 * Guarded authorization for committing a CONFIGURED RELATIONSHIP collection proposal.
 *
 * The execution split (see docs/platform/core/data/relationship-model.md):
 *
 *   native structural collection    → the existing native structural commit path (unchanged)
 *   configured relationship collection → approved Processing proposal
 *                                      → server-resolved Relationship Definition
 *                                      → guarded relationshipExecutionAdapter
 *                                      → canonical idempotent relationship write
 *
 * This module is the gate for the second branch. It deliberately mirrors
 * `verifyExistingChildCommitAuthorization` rather than generalising it: broadening the children path
 * would create a second relationship writer, which is exactly what the convergence decision forbids.
 *
 * AUTHORITY RULE — every relationship fact is re-derived here from the proposal's
 * `collection_provider_ref`. A caller may identify WHICH proposal to commit; it may never assert the
 * role, the command, the scope, the entities or the write destination. Anything it does assert is
 * compared against the server's answer and rejected on conflict, so a spoof surfaces as an error
 * rather than succeeding under different semantics.
 */

import type { RelatedRecordInstanceProposal } from "@/lib/intake/proposals/types";
import type { RelatedRecordProposalCaseContext } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";
import {
    relationshipDefinitionForRef,
    type RelationshipDefinition,
} from "@/lib/fields/relationship/relationshipDefinitions";

export type RelationshipCommitAuthorizationFailure = {
    ok: false;
    status: 400 | 403 | 404 | 409;
    reason: string;
    code: string;
};

export type RelationshipCommitAuthorizationSuccess = {
    ok: true;
    proposal: RelatedRecordInstanceProposal;
    /** Server-resolved definition — the ONLY source of relationship authority for this commit. */
    definition: RelationshipDefinition;
    /** Server-derived command + role + scope actually executed. */
    resolved: {
        commandKey: string;
        roleKey: string;
        scope: string;
        identityAction: "link_existing_person" | "create_proposed_person";
        existingPersonId?: string;
    };
    context: RelatedRecordProposalCaseContext;
};

/** What a caller is permitted to send. Note: no role, command, entity, direction or destination. */
export type RelationshipCommitRequest = {
    proposalId: string;
    /** Optional operator scope choice — validated against the definition's supported scopes. */
    scope?: string;
    /** Optional; must match the server's answer if present. Rejected on conflict. */
    assertedRoleKey?: string;
    assertedCommandKey?: string;
    /** Guards against committing a proposal the operator reviewed in an older state. */
    expectedProposalStatus?: string;
};

export function verifyRelationshipCommitAuthorization(args: {
    orgId: string;
    proposalId: string;
    proposalContext: RelatedRecordProposalCaseContext | null;
    request: RelationshipCommitRequest;
    /** Operator decision recorded in Processing — the commit requires an explicit approval. */
    instanceDecision: "approve" | "reject" | "defer" | undefined;
}): RelationshipCommitAuthorizationSuccess | RelationshipCommitAuthorizationFailure {
    const { proposalContext, proposalId, request } = args;

    if (!proposalContext) {
        return { ok: false, status: 404, reason: "Proposal not found for case", code: "proposal_not_found" };
    }
    const proposal = proposalContext.proposal;
    if (proposal.proposal_id !== proposalId) {
        return { ok: false, status: 404, reason: "Proposal identity mismatch", code: "proposal_identity_mismatch" };
    }

    // Must be an APPROVED proposal — a commit is never implied by the proposal existing.
    if (args.instanceDecision !== "approve") {
        return {
            ok: false,
            status: 403,
            reason: "Relationship commit requires an approved proposal decision.",
            code: "proposal_not_approved",
        };
    }

    if (proposal.execution_kind !== "configured_relationship") {
        return {
            ok: false,
            status: 403,
            reason: "Not a configured relationship collection — native structural collections use the native commit path.",
            code: "not_a_configured_relationship",
        };
    }
    if (proposal.status !== "valid") {
        return { ok: false, status: 403, reason: "Proposal is not valid", code: "proposal_invalid" };
    }

    // STALENESS — the operator approved a specific proposal state.
    if (request.expectedProposalStatus && request.expectedProposalStatus !== proposal.status) {
        return {
            ok: false,
            status: 409,
            reason: "Proposal changed since it was reviewed — re-confirm before committing.",
            code: "proposal_stale",
        };
    }

    // ── server-resolved relationship authority ───────────────────────────────────────────────────
    const definition = relationshipDefinitionForRef(proposal.collection_provider_ref);
    if (!definition) {
        return {
            ok: false,
            status: 400,
            reason: `No relationship definition for provider "${proposal.collection_provider_ref}".`,
            code: "unknown_definition",
        };
    }

    const intent = proposal.relationship_intent;
    if (!intent) {
        return {
            ok: false,
            status: 400,
            reason: "Proposal carries no server-derived relationship intent.",
            code: "missing_relationship_intent",
        };
    }

    // Client assertions are compared, never trusted.
    if (request.assertedRoleKey && request.assertedRoleKey !== definition.operational_role_key) {
        return {
            ok: false,
            status: 400,
            reason: "Role is determined by the relationship definition and cannot be supplied by the client.",
            code: "client_role_not_authoritative",
        };
    }
    if (request.assertedCommandKey && request.assertedCommandKey !== definition.apply_command_key) {
        return {
            ok: false,
            status: 400,
            reason: "Command is determined by the relationship definition and cannot be supplied by the client.",
            code: "client_command_not_authoritative",
        };
    }

    const scope = request.scope?.trim() || definition.scopes[0] || "this_child";
    if (!definition.scopes.includes(scope)) {
        return {
            ok: false,
            status: 400,
            reason: `Scope "${scope}" is not supported by the ${definition.label} relationship.`,
            code: "scope_not_supported",
        };
    }

    // Organization isolation is enforced upstream: `loadRelatedRecordProposalForCase` queries scoped
    // to the caller's orgId, so a cross-organization proposal surfaces here as `proposal_not_found`
    // rather than as an authorization failure. Household ownership is checked by the executor, which
    // resolves the anchor customer server-side.
    if (intent.identity_action === "link_existing_person" && !intent.existing_person_id) {
        return {
            ok: false,
            status: 400,
            reason: "Existing-person link is missing its canonical person id.",
            code: "missing_existing_person",
        };
    }

    return {
        ok: true,
        proposal,
        definition,
        resolved: {
            commandKey: definition.apply_command_key,
            roleKey: definition.operational_role_key,
            scope,
            identityAction: intent.identity_action,
            ...(intent.existing_person_id ? { existingPersonId: intent.existing_person_id } : {}),
        },
        context: proposalContext,
    };
}
