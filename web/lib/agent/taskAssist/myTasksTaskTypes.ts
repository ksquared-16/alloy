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
    created_at: string;
    /** Presentation-only — workspace GET enrichment. */
    entity_label?: string | null;
    household_label?: string | null;
    contact_label?: string | null;
    status_label?: string | null;
    children_labels?: string[] | null;
    contact_field_label?: string | null;
    location_id?: string | null;
};
