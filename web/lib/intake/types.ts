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

export type IntakeFactType =
    | "person_name"
    | "email"
    | "phone"
    | "date"
    | "dob"
    | "age_years"
    | "location_label"
    | "program_interest"
    | "relationship"
    | "source"
    | "notes"
    | "amount"
    | "document_identifier";

export type IntakeValidationState = "valid" | "invalid" | "ambiguous" | "unknown";

export type IntakeFactRoleHint = "parent" | "child" | "unknown";

export type IntakeFactConfidence = "high" | "medium" | "low";

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

export type IntakeFieldCandidate = {
    payload_key: string;
    rule_id: string | null;
    value: string;
    confidence: "high" | "medium" | "low" | "invalid";
    fact_ids: string[];
    validation_state: IntakeValidationState;
};

export type IntakeFieldMappingResult = {
    action_key?: string;
    candidates: IntakeFieldCandidate[];
    unmapped_text?: string;
};
