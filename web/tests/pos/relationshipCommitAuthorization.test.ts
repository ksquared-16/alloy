/**
 * Guarded relationship commit — the client identifies WHICH proposal, never WHAT it means.
 *
 * Certifies the authorization gate that stands between an approved Processing proposal and the
 * canonical relationship write. Every relationship fact is re-derived from the proposal's
 * `collection_provider_ref`; anything the caller asserts is compared against the server's answer and
 * rejected on conflict, so a spoof surfaces as an error instead of succeeding under other semantics.
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import { describe, it, expect } from "vitest";

import {
    verifyRelationshipCommitAuthorization,
    type RelationshipCommitRequest,
} from "@/lib/pos/processingCase/commit/verifyRelationshipCommitAuthorization";
import type { RelatedRecordInstanceProposal } from "@/lib/intake/proposals/types";
import type { RelatedRecordProposalCaseContext } from "@/lib/pos/processingCase/commit/loadRelatedRecordProposalForCase";

const ORG = "org-1";
const PROPOSAL_ID = "prop-emergency-1";
const EMERGENCY_REF = "person.contact_role.emergency_contacts";

function proposal(overrides: Partial<RelatedRecordInstanceProposal> = {}): RelatedRecordInstanceProposal {
    return {
        proposal_id: PROPOSAL_ID,
        collection_provider_ref: EMERGENCY_REF,
        item_entity_type: "person",
        instance_key: "ec-1",
        origin: "respondent_added",
        field_proposals: [],
        source_lineage: { source_kind: "form_submission", source_record_id: "sub-1" },
        diagnostics: [],
        status: "valid",
        execution_kind: "configured_relationship",
        relationship_intent: {
            definition_key: "emergency_contacts",
            operational_role_key: "emergency_contact",
            apply_command_key: "add_emergency_contact",
            relationship_scope: "child",
            default_scope: "this_child",
            supported_scopes: ["this_child", "selected_children", "all_children_in_household"],
            identity_action: "create_proposed_person",
            proposed_person_facts: [{ entity_type: "person", field_key: "full_name", value: "Susan Ruiz" }],
        },
        ...overrides,
    } as RelatedRecordInstanceProposal;
}

function context(p: RelatedRecordInstanceProposal = proposal()): RelatedRecordProposalCaseContext {
    return { proposal: p, expectedCustomerId: "cust-1", source: { source_kind: "form_submission", source_id: "sub-1" } };
}

function verify(args: {
    proposalContext?: RelatedRecordProposalCaseContext | null;
    request?: Partial<RelationshipCommitRequest>;
    instanceDecision?: "approve" | "reject" | "defer";
}) {
    return verifyRelationshipCommitAuthorization({
        orgId: ORG,
        proposalId: PROPOSAL_ID,
        proposalContext: args.proposalContext === undefined ? context() : args.proposalContext,
        request: { proposalId: PROPOSAL_ID, ...args.request },
        // `in` rather than `??` so an EXPLICIT undefined (no decision recorded) is preserved.
        instanceDecision: "instanceDecision" in args ? args.instanceDecision : "approve",
    });
}

describe("guarded relationship commit authorization", () => {
    it("approves a valid, approved, configured-relationship proposal and derives authority", () => {
        const res = verify({});
        expect(res.ok, res.ok ? "" : res.reason).toBe(true);
        if (!res.ok) return;
        // NONE of this came from the request.
        expect(res.resolved.commandKey).toBe("add_emergency_contact");
        expect(res.resolved.roleKey).toBe("emergency_contact");
        expect(res.resolved.scope).toBe("this_child");
        expect(res.resolved.identityAction).toBe("create_proposed_person");
        expect(res.definition.definition_key).toBe("emergency_contacts");
    });

    it("PROPOSAL MUST BE APPROVED — existing is not implied consent", () => {
        for (const decision of ["reject", "defer", undefined] as const) {
            const res = verify({ instanceDecision: decision });
            expect(res.ok).toBe(false);
            if (!res.ok) expect(res.code).toBe("proposal_not_approved");
        }
    });

    it("MISSING PROPOSAL is rejected (also how cross-organization surfaces)", () => {
        const res = verify({ proposalContext: null });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(404);
            expect(res.code).toBe("proposal_not_found");
        }
    });

    it("PROPOSAL IDENTITY MISMATCH is rejected", () => {
        const res = verify({ proposalContext: context(proposal({ proposal_id: "someone-elses" })) });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("proposal_identity_mismatch");
    });

    it("SPOOFED ROLE is rejected, not silently ignored", () => {
        const res = verify({ request: { assertedRoleKey: "guardian" } });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(400);
            expect(res.code).toBe("client_role_not_authoritative");
        }
    });

    it("a role assertion that MATCHES the server is allowed through", () => {
        const res = verify({ request: { assertedRoleKey: "emergency_contact" } });
        expect(res.ok).toBe(true);
    });

    it("SPOOFED COMMAND is rejected", () => {
        const res = verify({ request: { assertedCommandKey: "add_parent_guardian" } });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("client_command_not_authoritative");
    });

    it("INVALID SCOPE is rejected against the definition's supported scopes", () => {
        const res = verify({ request: { scope: "this_opportunity" } });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("scope_not_supported");
    });

    it("a SUPPORTED scope override is honoured", () => {
        const res = verify({ request: { scope: "all_children_in_household" } });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.resolved.scope).toBe("all_children_in_household");
    });

    it("UNKNOWN DEFINITION is rejected", () => {
        const res = verify({
            proposalContext: context(proposal({ collection_provider_ref: "person.contact_role.unicorns" })),
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("unknown_definition");
    });

    it("NATIVE structural collections are refused — they use the native commit path", () => {
        const res = verify({
            proposalContext: context(
                proposal({ collection_provider_ref: "children", execution_kind: "native_structural" }),
            ),
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("not_a_configured_relationship");
    });

    it("INVALID proposal status is rejected", () => {
        const res = verify({ proposalContext: context(proposal({ status: "invalid" })) });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("proposal_invalid");
    });

    it("STALE proposal is rejected and asks for re-confirmation", () => {
        const res = verify({ request: { expectedProposalStatus: "incomplete" } });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(409);
            expect(res.code).toBe("proposal_stale");
        }
    });

    it("a link-existing instance without a canonical person id is rejected", () => {
        const p = proposal();
        const res = verify({
            proposalContext: context({
                ...p,
                relationship_intent: { ...p.relationship_intent!, identity_action: "link_existing_person" },
            } as RelatedRecordInstanceProposal),
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("missing_existing_person");
    });

    it("a link-existing instance WITH a person id resolves to a link, not a create", () => {
        const p = proposal();
        const res = verify({
            proposalContext: context({
                ...p,
                origin: "existing_record",
                relationship_intent: {
                    ...p.relationship_intent!,
                    identity_action: "link_existing_person",
                    existing_person_id: "person-123",
                },
            } as RelatedRecordInstanceProposal),
        });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.resolved.identityAction).toBe("link_existing_person");
            expect(res.resolved.existingPersonId).toBe("person-123");
        }
    });

    it("a proposal with no server-derived intent is rejected", () => {
        const res = verify({
            proposalContext: context(proposal({ relationship_intent: undefined })),
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("missing_relationship_intent");
    });

    it("MULTI-ROLE: the same Person may be committed under a second role via its own definition", () => {
        // authorized_pickup for the same person id — a distinct definition, command and edge.
        const p = proposal({
            proposal_id: PROPOSAL_ID,
            collection_provider_ref: "person.contact_role.authorized_pickups",
            relationship_intent: {
                definition_key: "authorized_pickups",
                operational_role_key: "authorized_pickup",
                apply_command_key: "add_authorized_pickup",
                relationship_scope: "child",
                default_scope: "this_child",
                supported_scopes: ["this_child", "selected_children", "all_children_in_household"],
                identity_action: "link_existing_person",
                existing_person_id: "person-123",
                proposed_person_facts: [],
            },
        });
        const res = verify({ proposalContext: context(p) });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.resolved.commandKey).toBe("add_authorized_pickup");
            expect(res.resolved.roleKey).toBe("authorized_pickup");
            // Same canonical Person identity as the guardian commit — a second ROLE, not a second person.
            expect(res.resolved.existingPersonId).toBe("person-123");
        }
    });
});
