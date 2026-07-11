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
