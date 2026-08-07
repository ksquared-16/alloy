/**
 * Typed payloads for the registered identity commands (D0).
 * Payloads are semantic; they never carry physical table/column names.
 */

export type CreatePersonPayload = {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    status_key_on_create?: string | null;
};

export type UpdatePersonPayload = {
    person_id: string;
    /** Optimistic concurrency: expected updated_at / version token. */
    expected_version?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    status_key?: string | null;
};

export type CreateHouseholdPayload = {
    household_name: string;
    vertical_id?: string | null;
};

export type LinkPersonToHouseholdPayload = {
    person_id: string;
    household_id: string;
    role_type?: string | null;
    primary?: boolean;
};

export type CreateChildPayload = {
    household_id: string;
    display_name: string;
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
    /** Child profile gender (customer_member field_values). */
    gender?: "female" | "male" | null;
    /** Optional backing person record for the child. */
    person_id?: string | null;
    relationship?: string | null;
};

export type UpdateChildPayload = {
    child_id: string;
    expected_version?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
};

export type LinkChildToHouseholdPayload = {
    /** person backing the child (shared custody: same person, another household). */
    person_id: string;
    household_id: string;
    display_name: string;
    dob?: string | null;
    relationship?: string | null;
};

export type CreateLeadPayload = {
    household_id: string;
    primary_person_id: string;
    name: string;
    status_key?: string | null;
    stage_key?: string | null;
    work_unit_id?: string | null;
    /** Lead site — cascades to opportunity.location_id on create. */
    location_id?: string | null;
};

export type UpdateLeadPayload = {
    lead_id: string;
    expected_version?: string | null;
    name?: string | null;
    status_key?: string | null;
};

export type LinkPersonToLeadPayload = {
    person_id: string;
    lead_id: string;
    role_type?: string | null;
    role?: string | null;
};

export type CreateProcessParticipationPayload = {
    /** child = the subject moving through enrollment. */
    child_id: string;
    /** lead = the participation context. */
    lead_id: string;
    stage_key?: string | null;
    state?: string | null;
    participation?: {
        start_date?: string | null;
        schedule_type?: string | null;
        program_category_id?: string | null;
        location_id?: string | null;
        program_room_cohort_key?: string | null;
        notes?: string | null;
    };
};

export type UpdateProcessParticipationPayload = {
    participation_id: string;
    expected_version?: string | null;
    stage_key?: string | null;
    state?: string | null;
};

export type AttachDocumentPayload = {
    document_id: string;
    target_entity_type: "person" | "customer" | "opportunity" | "customer_member";
    target_entity_id: string;
    doc_type?: string | null;
};

export type UpdateCommunicationPreferencesPayload = {
    person_id: string;
    category: string;
    state: "opted_in" | "opted_out" | "unset";
    method?: string | null;
    source?: string | null;
};

export type ProposeMergePayload = {
    entity_type: "person" | "customer" | "customer_member";
    survivor_id: string;
    duplicate_id: string;
    reason: string;
    evidence_ids?: string[];
};
