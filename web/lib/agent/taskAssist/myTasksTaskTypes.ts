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
};
