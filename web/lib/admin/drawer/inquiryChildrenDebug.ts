/**
 * Dev-only inquiry children tracing (drawer vs work-unit parity).
 * Search console for `[inquiry-children-debug]`.
 */

export type InquiryChildrenDebugRow = {
    id?: string;
    customer_member_id?: string;
    ocm_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
    linked_on_inquiry?: boolean;
    relationship?: string | null;
    is_active?: boolean | null;
};

export function filterInquiryChildRowsForDrawer<
    T extends {
        id?: string;
        customer_member_id?: string;
        display_name?: string | null;
    },
>(rows: T[]): { kept: T[]; dropped: Array<{ row: T; reason: string }> } {
    const kept: T[] = [];
    const dropped: Array<{ row: T; reason: string }> = [];
    for (const r of rows) {
        if (!r.id) {
            dropped.push({ row: r, reason: "missing id" });
            continue;
        }
        const cm = String(r.customer_member_id ?? "").trim();
        const name = String(r.display_name ?? "").trim();
        if (!cm && !name) {
            dropped.push({ row: r, reason: "missing customer_member_id and display_name" });
            continue;
        }
        if (cm.startsWith("metadata_child:")) {
            dropped.push({ row: r, reason: "metadata_child synthetic row" });
            continue;
        }
        kept.push(r);
    }
    return { kept, dropped };
}

function devEnabled(): boolean {
    return process.env.NODE_ENV !== "production";
}

export function logInquiryChildrenDebug(event: string, payload: Record<string, unknown>): void {
    if (!devEnabled()) return;
    console.info("[inquiry-children-debug]", event, payload);
}

export function summarizeInquiryChildrenRows(rows: InquiryChildrenDebugRow[]): InquiryChildrenDebugRow[] {
    return rows.map((r) => ({
        id: r.id,
        customer_member_id: r.customer_member_id,
        ocm_id: r.ocm_id ?? null,
        first_name: r.first_name ?? null,
        last_name: r.last_name ?? null,
        display_name: r.display_name ?? null,
        linked_on_inquiry: r.linked_on_inquiry === true,
        relationship: r.relationship ?? null,
        is_active: r.is_active ?? null,
    }));
}
