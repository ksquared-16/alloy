/** Workspace operational task row shape (API + client cache). */
export type MyTasksTaskRow = {
    id: string;
    title: string;
    description: string | null;
    due_at: string;
    status: string;
    source: string;
    entity_id: string | null;
    entity_type: string | null;
    assigned_to_user_id?: string | null;
    created_at: string;
    /** Presentation-only — workspace GET enrichment. */
    entity_label?: string | null;
    household_label?: string | null;
    contact_label?: string | null;
    status_label?: string | null;
    children_labels?: string[] | null;
    contact_field_label?: string | null;
    location_id?: string | null;
    assignee_label?: string | null;
    /**
     * Business Process dimensions — read-only projection of task metadata (see
     * `extractOperationalTaskBpDimensions`). `null`/absent when the task is not Business
     * Process–generated. Used to group Work Items by real Process / Stage.
     */
    department_id?: string | null;
    lifecycle_stage_key?: string | null;
    work_definition_key?: string | null;
    lifecycle_provenance?: string | null;
    /** Processing convergence — projected or linked processing case. */
    processing_case_id?: string | null;
    processing_lane?: string | null;
    processing_source_label?: string | null;
    is_processing_projection?: boolean;
    /** Communications convergence — projected or linked communication thread. */
    communication_thread_id?: string | null;
    communication_lane?: string | null;
    communication_channel?: string | null;
    communication_family_label?: string | null;
    communication_topic_label?: string | null;
    communication_last_preview?: string | null;
    communication_last_activity_at?: string | null;
    is_communications_projection?: boolean;
    /** Documents convergence (D6) — a derived, unmet document requirement for one record. */
    document_requirement_id?: string | null;
    document_requirement_state?: "missing" | "pending_review" | "blocked" | "expired" | "expiring_soon" | null;
    /** D7: a derived document-attention row (its own validity or review), when this item is one. */
    document_attention_kind?: "expired" | "expiring_soon" | "review_due" | "date_missing" | null;
    document_attention_document_id?: string | null;
    document_requirement_label?: string | null;
    document_requirement_subject_type?: string | null;
    document_requirement_subject_label?: string | null;
    is_document_requirement_projection?: boolean;
};
