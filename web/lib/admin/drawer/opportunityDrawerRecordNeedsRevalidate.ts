/** Whether an opportunity drawer cache snapshot needs full hydrate after returning from person navigation. */

export function opportunityDrawerRecordNeedsRevalidate(record: Record<string, unknown>): boolean {
    const surface = String(record._record_surface ?? "").trim();
    if (surface !== "full") return true;
    if (record._member_person_graph_pending === true) return true;

    const children = record._inquiry_children;
    if (!Array.isArray(children)) return false;

    for (const raw of children) {
        if (!raw || typeof raw !== "object") continue;
        const row = raw as {
            desired_program_type?: string | null;
            desired_program_label?: string | null;
            linked_on_inquiry?: boolean;
        };
        const typeKey = String(row.desired_program_type ?? "").trim();
        const label = String(row.desired_program_label ?? "").trim();
        if (typeKey && !label) return true;
    }

    return false;
}
