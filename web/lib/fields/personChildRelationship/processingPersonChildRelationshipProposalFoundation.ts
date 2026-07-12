/**
 * Processing proposal foundation — distinct Person vs relationship proposals.
 */

export type ProcessingPersonFieldProposal = {
    kind: "person_field";
    person_id: string;
    field_key: string;
    value: unknown;
};

export type ProcessingRelationshipFieldProposal = {
    kind: "relationship_field";
    relationship_id: string;
    person_id: string;
    customer_member_id: string;
    field_key: string;
    value: unknown;
};

export type ProcessingRelationshipRoleProposal = {
    kind: "relationship_role";
    relationship_id: string;
    role_key: string;
    action: "add" | "remove";
};

export type ProcessingRelatedRecordProposal =
    | ProcessingPersonFieldProposal
    | ProcessingRelationshipFieldProposal
    | ProcessingRelationshipRoleProposal;

export function isRelationshipScopedProposal(
    proposal: ProcessingRelatedRecordProposal,
): proposal is ProcessingRelationshipFieldProposal | ProcessingRelationshipRoleProposal {
    return proposal.kind !== "person_field";
}
