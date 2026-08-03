/**
 * Canonical related-record proposal model — source- and consumer-independent.
 *
 * Represents proposed changes involving collection items (existing record updates
 * or proposed new records). Not collection provider runtime resolution.
 */

export type RelatedRecordProposalOrigin = "existing_record" | "proposed_new_record";

export type RelatedRecordProposalStatus = "valid" | "invalid" | "unsupported" | "incomplete";

export type ProposalDiagnosticCode =
    | "unknown_provider"
    | "missing_instance_key"
    | "invalid_existing_record_id"
    | "missing_field_binding"
    | "unsupported_item_entity"
    | "collection_mismatch"
    | "duplicate_instance_key"
    | "malformed_value"
    | "missing_source_context"
    | "org_boundary"
    | "inaccessible_record"
    | "source_empty";

export type ProposalDiagnostic = {
    code: ProposalDiagnosticCode;
    message: string;
    path?: string;
};

/** Source-specific identity — Forms field/group IDs live in source_metadata. */
export type ProposalSourceLineage = {
    source_kind: string;
    source_record_id: string;
    source_path?: string;
    source_metadata?: Record<string, string>;
};

export type RelatedRecordFieldProposal = {
    provider_ref: string;
    submitted_value: unknown;
    /** Optional value observed when the proposal was formed; enables stale-data checks. */
    observed_value?: unknown;
    source_fact_ref?: string;
    label?: string;
};

/**
 * How a collection is executed. The DEFINITION decides — this is the execution split:
 *
 *   native_structural       → the existing native structural commit path (children, household members)
 *   configured_relationship → approved proposal → server-resolved definition → guarded
 *                             relationshipExecutionAdapter → canonical idempotent relationship write
 *
 * @see docs/platform/core/data/relationship-model.md
 */
export type CollectionExecutionKind = "native_structural" | "configured_relationship" | "unknown";

/**
 * SERVER-DERIVED relationship intent for a configured relationship collection instance.
 *
 * Every value here is resolved on the server from `collection_provider_ref` → Relationship
 * Definition. None of it is submitted by the client: a form carries only the provider ref, so a
 * respondent (or a crafted payload) can never assert a role, a command, a scope, or a write
 * destination. This is the object the guarded execution route trusts.
 */
export type RelatedRecordRelationshipIntent = {
    /** Stable definition key the intent was resolved from. */
    definition_key: string;
    operational_role_key: string;
    /** Canonical write command (relationshipActionRegistry → relationshipExecutionAdapter). */
    apply_command_key: string;
    /** Anchor grain the role attaches to. */
    relationship_scope: "child" | "household";
    /** Scope applied when the operator does not choose one. */
    default_scope: string;
    /** Scopes the definition permits — anything else is rejected. */
    supported_scopes: readonly string[];
    /** Whether the commit links a known Person or creates a proposed one. */
    identity_action: "link_existing_person" | "create_proposed_person";
    /** Canonical person id when the instance references a known Person. */
    existing_person_id?: string;
    /** Person facts proposed from the nested responses (create/update candidates). */
    proposed_person_facts: Array<{ entity_type: string; field_key: string; value: unknown }>;
};

export type RelatedRecordInstanceProposal = {
    proposal_id: string;
    collection_provider_ref: string;
    item_entity_type: string;
    instance_key: string;
    origin: RelatedRecordProposalOrigin;
    existing_record_id?: string;
    field_proposals: RelatedRecordFieldProposal[];
    source_lineage: ProposalSourceLineage;
    diagnostics: ProposalDiagnostic[];
    status: RelatedRecordProposalStatus;
    /** Which execution path this instance takes. */
    execution_kind?: CollectionExecutionKind;
    /** Present only for `configured_relationship` instances. */
    relationship_intent?: RelatedRecordRelationshipIntent;
};

export type RelatedRecordCollectionProposal = {
    collection_key: string;
    collection_provider_ref: string;
    instances: RelatedRecordInstanceProposal[];
    status: RelatedRecordProposalStatus;
    diagnostics: ProposalDiagnostic[];
};

export type RelatedRecordProposalBundle = {
    collections: RelatedRecordCollectionProposal[];
    diagnostics: ProposalDiagnostic[];
};
