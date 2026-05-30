function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/** Locate an inquiry child row on the opportunity record by person or member id. */
export function findInquiryChildInOpportunityRecord(
    opportunityRecord: Record<string, unknown>,
    keys: { personId?: string | null; customerMemberId?: string | null }
): Record<string, unknown> | null {
    const pid = trimId(keys.personId);
    const cmId = trimId(keys.customerMemberId);
    const rows = opportunityRecord._inquiry_children;
    if (!Array.isArray(rows)) return null;

    for (const raw of rows) {
        if (!raw || typeof raw !== "object") continue;
        const row = raw as Record<string, unknown>;
        const rowPersonId = trimId(row.person_id);
        const rowMemberId = trimId(row.customer_member_id);
        if (pid && rowPersonId === pid) return row;
        if (cmId && rowMemberId === cmId) return row;
    }
    return null;
}
