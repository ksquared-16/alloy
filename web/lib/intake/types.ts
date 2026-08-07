import type { DerivedFieldResult } from "@/lib/fields/derived/types";
import type { IntakeReviewWarning } from "@/lib/intake/review/intakeReviewWarnings";

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
    | "gender"
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

export type IntakePersonCandidateRole = "parent" | "guardian" | "child" | "dependent" | "unknown";

export type IntakePersonCandidate = {
    candidate_id: string;
    role: IntakePersonCandidateRole;
    first_name: string | null;
    last_name: string | null;
    emails: string[];
    phones: string[];
    dob: string | null;
    /** Extracted approximate age when DOB is absent. */
    age_years: number | null;
    /** Derived from DOB when available — preferred for display. */
    calculated_age: Pick<DerivedFieldResult, "value" | "display"> | null;
    /** Child profile gender when parsed from intake (female|male). */
    gender?: "female" | "male" | null;
    program_interest: string | null;
    source_fact_ids: string[];
    confidence: IntakeFactConfidence;
    validation_state: IntakeValidationState;
    source_line?: number;
    /** True when last name was inferred from household parents. */
    last_name_inferred?: boolean;
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

export type IntakeRelationshipKind =
    | "parent_guardian_to_child"
    | "household_to_person"
    | "lead_to_person"
    | "unresolved";

export type IntakeRelationshipCandidate = {
    relationship_id: string;
    kind: IntakeRelationshipKind;
    from_candidate_id: string;
    to_candidate_id: string;
    confidence: IntakeFactConfidence;
    validation_state: IntakeValidationState;
    source_fact_ids: string[];
    /** True when inferred from household grouping (parent × child), not an explicit relationship fact. */
    inferred?: boolean;
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

export type IntakeHouseholdContact = {
    kind: "email" | "phone";
    value: string;
    raw_value: string;
    validation_state: IntakeValidationState;
    source_fact_ids: string[];
};

export type IntakeHouseholdCandidate = {
    household_id: string;
    /** Canonical guardian/parent people candidates. */
    parents_guardians: IntakePersonCandidate[];
    /** @deprecated Use parents_guardians — kept for transitional imports. */
    parents: IntakePersonCandidate[];
    children: IntakePersonCandidate[];
    /** Household-level contacts not yet assigned to a specific person. */
    household_contacts: IntakeHouseholdContact[];
    address: IntakeAddressCandidate | null;
    location: IntakeLocationCandidate | null;
    source: string | null;
    notes: string | null;
    program_interest: string | null;
    start_date: string | null;
    relationships: IntakeRelationshipCandidate[];
    unassigned_fact_ids: string[];
    /** Full unassigned facts for review/debug surfaces. */
    unmapped_facts: IntakeFact[];
    review_warnings: IntakeReviewWarning[];
    /** When true, commit path can only persist primary parent + first child. */
    commit_limited_to_primary?: boolean;
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
    review_warning_items?: IntakeReviewWarning[];
};
