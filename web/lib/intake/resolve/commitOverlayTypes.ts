import type {
    IntakeRecordMatchConfidence,
    IntakeRecordResolutionAction,
    IntakeRecordResolutionCandidate,
} from "@/lib/intake/resolve/types";

export type CreateLeadCommitResolutionState = "new" | "linked" | "possible_match" | "conflict";

export type CreateLeadCommitResolution = {
    state: CreateLeadCommitResolutionState;
    action: IntakeRecordResolutionAction;
    confidence: IntakeRecordMatchConfidence;
    linked_entity_type?: "person" | "customer" | "customer_member" | "opportunity";
    linked_entity_id?: string;
    match_display_name?: string;
    candidate_match_id?: string;
    reasons: string[];
    blocking_conflicts?: string[];
    candidates?: IntakeRecordResolutionCandidate[];
};

export type CreateLeadHouseholdResolution = {
    state: CreateLeadCommitResolutionState;
    action: IntakeRecordResolutionAction;
    linked_customer_id?: string;
    match_display_name?: string;
    reasons: string[];
};

export type CreateLeadLeadResolution = {
    state: CreateLeadCommitResolutionState;
    action: IntakeRecordResolutionAction;
    linked_opportunity_id?: string;
    reasons: string[];
};
