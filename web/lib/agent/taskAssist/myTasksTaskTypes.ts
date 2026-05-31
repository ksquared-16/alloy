/** Workspace operational task row shape (API + client cache). */
export type MyTasksTaskRow = {
    id: string;
    title: string;
    description: string | null;
    due_at: string;
    status: string;
    source: string;
    entity_id: string;
    entity_type: string;
    created_at: string;
};
