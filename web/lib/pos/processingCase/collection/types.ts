/**
 * P5A — Processing collection proposal read model (evidence only, no commit).
 */

export type ProcessingCollectionProposalStatus = "valid" | "invalid" | "unsupported" | "incomplete";

export type ProcessingCollectionDiagnosticCode =
    | "unknown_provider"
    | "missing_instance_key"
    | "invalid_existing_item_id"
    | "missing_field_binding"
    | "unsupported_iteration_entity"
    | "envelope_group_mismatch"
    | "duplicate_instance_key"
    | "malformed_value"
    | "missing_schema_context"
    | "org_boundary"
    | "inaccessible_item"
    | "envelope_empty";

export type ProcessingCollectionDiagnostic = {
    code: ProcessingCollectionDiagnosticCode;
    message: string;
    path?: string;
};

export type ProcessingCollectionFieldBinding = {
    field_id: string;
    provider_ref: string | null;
    entity_type: string | null;
    field_key: string | null;
    label: string;
    submitted_value: unknown;
    display_value: string | null;
};

export type ProcessingCollectionInstanceLineage = {
    processing_case_id: string | null;
    form_submission_id: string;
    form_definition_version_id: string | null;
    schema_group_id: string;
    collection_provider_ref: string;
    instance_key: string;
    payload_path: string;
    packet_session_id?: string | null;
};

export type ProcessingCollectionInstanceProposal = {
    proposal_id: string;
    collection_provider_ref: string;
    collection_label: string;
    iteration_entity_type: string;
    instance_key: string;
    origin: "existing" | "respondent_added";
    existing_item_id: string | null;
    identity_label: string | null;
    field_bindings: ProcessingCollectionFieldBinding[];
    status: ProcessingCollectionProposalStatus;
    diagnostics: ProcessingCollectionDiagnostic[];
    lineage: ProcessingCollectionInstanceLineage;
};

export type ProcessingCollectionGroupEvidence = {
    group_id: string;
    collection_provider_ref: string;
    collection_label: string;
    instances: ProcessingCollectionInstanceProposal[];
    status: ProcessingCollectionProposalStatus;
    diagnostics: ProcessingCollectionDiagnostic[];
};

export type ProcessingCollectionSourceEvidence = {
    groups: ProcessingCollectionGroupEvidence[];
    diagnostics: ProcessingCollectionDiagnostic[];
};
