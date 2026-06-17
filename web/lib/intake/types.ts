export type IntakeSourceKind =
    | "paste_text"
    | "form_submission"
    | "document"
    | "email_body"
    | "api_payload";

export type IntakeSourceEnvelope = {
    source_id: string;
    source_kind: IntakeSourceKind;
    captured_at: string;
    raw_material: string | Record<string, unknown>;
    metadata?: Record<string, unknown>;
};

export type IntakeValidationState = "valid" | "invalid" | "ambiguous" | "unknown";

export type IntakeFactRoleHint = "parent" | "child" | "unknown";

export type IntakeFactConfidence = "high" | "medium" | "low";

export type IntakeFactType =
    | "person_name"
    | "email"
    | "phone"
    | "date"
    | "dob"
    | "age_years"
    | "location_label"
    | "address"
    | "program_interest"
    | "relationship"
    | "source"
    | "notes"
    | "amount"
    | "document_identifier";

export type IntakeFact = {
    fact_id: string;
    fact_type: IntakeFactType;
    raw_value: string;
    normalized_value: string | number | null;
    confidence: IntakeFactConfidence;
    validation_state: IntakeValidationState;
    source_line?: number;
    source_span?: { start?: number; end?: number };
    evidence?: string;
    role_hint?: IntakeFactRoleHint;
};

export type IntakeFactExtractionResult = {
    source: IntakeSourceEnvelope;
    facts: IntakeFact[];
    unmapped_text?: string;
};

export type IntakePersonCandidateRole = "parent" | "guardian" | "child" | "unknown";

export type IntakePersonCandidate = {
    candidate_id: string;
    role: IntakePersonCandidateRole;
    first_name: string | null;
    last_name: string | null;
    emails: string[];
    phones: string[];
    dob: string | null;
    age_years: number | null;
    program_interest: string | null;
    source_fact_ids: string[];
    confidence: IntakeFactConfidence;
    validation_state: IntakeValidationState;
    source_line?: number;
};

export type IntakeAddressCandidate = {
    candidate_id: string;
    lines: string[];
    raw: string;
    source_fact_ids: string[];
    confidence: IntakeFactConfidence;
    validation_state: IntakeValidationState;
};

export type IntakeLocationCandidate = {
    label: string;
    resolved_value: string | null;
    resolved_label: string | null;
    source_fact_ids: string[];
    confidence: IntakeFactConfidence;
    validation_state: IntakeValidationState;
};

export type IntakeRelatedRecordCandidate = {
    candidate_id: string;
    entity_type: "person" | "address" | "location";
    role: IntakePersonCandidateRole | "address" | "location";
    summary: string;
    source_fact_ids: string[];
    confidence: IntakeFactConfidence;
    validation_state: IntakeValidationState;
};

export type IntakeHouseholdCandidate = {
    household_id: string;
    parents: IntakePersonCandidate[];
    children: IntakePersonCandidate[];
    address: IntakeAddressCandidate | null;
    location: IntakeLocationCandidate | null;
    source: string | null;
    notes: string | null;
    unassigned_fact_ids: string[];
    review_warnings: string[];
};

export type IntakeSelectOption = {
    value: string;
    label: string;
};

export type IntakeFieldCandidate = {
    payload_key: string;
    rule_id: string | null;
    value: string;
    confidence: "high" | "medium" | "low" | "invalid";
    fact_ids: string[];
    validation_state: IntakeValidationState;
    /** Human label when value is a resolved select option (e.g. location name). */
    display_value?: string;
};

export type IntakeFieldMappingResult = {
    action_key?: string;
    candidates: IntakeFieldCandidate[];
    unmapped_text?: string;
    household?: IntakeHouseholdCandidate;
    review_warnings?: string[];
};
