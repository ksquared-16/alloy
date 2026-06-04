/**
 * Resolve Person / Child drawer targets from queue preview rows for secondary row icons.
 * Reads runtime row fields only — queue rows are previews, not authoritative records.
 */

export type QueueRowRelatedDrawerTargets = {
    opportunityId: string;
    personId: string | null;
    childPersonId: string | null;
};

function trimId(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function inquiryChildrenFromRow(row: Record<string, unknown>): unknown[] {
    const direct = row._inquiry_children;
    if (Array.isArray(direct)) return direct;
    const md = row.metadata;
    if (md && typeof md === "object" && !Array.isArray(md)) {
        const ic = (md as { inquiry_children?: unknown }).inquiry_children;
        if (Array.isArray(ic)) return ic;
    }
    return [];
}

function firstChildPersonIdFromInquiryChildren(children: unknown[]): string | null {
    for (const raw of children) {
        if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
        const pid = trimId((raw as { person_id?: unknown }).person_id);
        if (pid) return pid;
    }
    return null;
}

export function extractQueueRowRelatedDrawerTargets(
    row: Record<string, unknown> | null | undefined,
    opportunityId: string
): QueueRowRelatedDrawerTargets {
    const oppId = trimId(opportunityId) || trimId(row?.id) || trimId(row?.opportunity_id);
    const personId =
        trimId(row?._primary_person_id) ||
        trimId(row?.primary_person_id) ||
        null;
    const inquiryChildren = row ? inquiryChildrenFromRow(row) : [];
    const childPersonId = firstChildPersonIdFromInquiryChildren(inquiryChildren);

    return {
        opportunityId: oppId,
        personId,
        childPersonId,
    };
}
