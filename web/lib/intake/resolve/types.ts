/** Source-agnostic record resolution for intake flows (Create Lead, forms, POS, imports). */

export type IntakeRecordMatchConfidence =
    | "exact_match"
    | "probable_match"
    | "possible_match"
    | "no_match"
    | "conflict";

export type IntakeRecordResolutionAction = "link_existing" | "create_new" | "review_required" | "reject";

export type IntakeRecordEntityRole = "parent" | "guardian" | "child" | "household" | "lead";

export type IntakeMatchedEntityType = "person" | "customer" | "customer_member" | "opportunity";

export type IntakeRecordResolutionCandidate = {
    candidate_id: string;
    intake_candidate_id: string;
    intake_entity_role: IntakeRecordEntityRole;
    matched_entity_type: IntakeMatchedEntityType;
    matched_entity_id: string;
    confidence: IntakeRecordMatchConfidence;
    score?: number;
    reasons: string[];
    blocking_conflicts?: string[];
    /** Operator display (e.g. person name, household name). */
    match_display_name?: string;
};

export type IntakeRecordResolutionProposal = {
    intake_candidate_id: string;
    action: IntakeRecordResolutionAction;
    selected_match_id?: string;
    confidence: IntakeRecordMatchConfidence;
    reasons: string[];
};

export type IntakeRecordResolutionSummary = {
    auto_link_count: number;
    review_required_count: number;
    create_new_count: number;
    conflict_count: number;
};

export type IntakeRecordResolutionResult = {
    source_kind: string;
    source_id?: string;
    candidates: IntakeRecordResolutionCandidate[];
    proposals: IntakeRecordResolutionProposal[];
    summary: IntakeRecordResolutionSummary;
};

export type ResolveIntakeRecordResolutionInput = {
    orgId: string;
    source_kind: string;
    source_id?: string;
    household: import("@/lib/intake/types").IntakeHouseholdCandidate;
    location_id?: string | null;
};
