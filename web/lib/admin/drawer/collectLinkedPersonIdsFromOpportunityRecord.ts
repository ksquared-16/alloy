import { findInquiryChildInOpportunityRecord } from "@/lib/admin/drawer/inquiryChildOpportunityRows";
import { primaryPersonIdFromOpportunityRecord } from "@/lib/admin/drawer/linkedRecordFieldEditing";

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/** Person entity ids linked on an opportunity drawer record (primary, persons, inquiry children). */
export function collectLinkedPersonIdsFromOpportunityRecord(record: Record<string, unknown>): string[] {
    const ids = new Set<string>();
    const primary = primaryPersonIdFromOpportunityRecord(record);
    if (primary) ids.add(primary);

    const rows = record._opportunity_persons;
    if (Array.isArray(rows)) {
        for (const row of rows) {
            if (!row || typeof row !== "object") continue;
            const personId = trimId((row as { person_id?: unknown }).person_id);
            if (personId) ids.add(personId);
        }
    }

    const inquiryChildren = record._inquiry_children;
    if (Array.isArray(inquiryChildren)) {
        for (const row of inquiryChildren) {
            if (!row || typeof row !== "object") continue;
            const raw = row as Record<string, unknown>;
            const personId = trimId(raw.person_id);
            if (personId) {
                ids.add(personId);
                continue;
            }
            const cmId = trimId(raw.customer_member_id);
            if (!cmId || cmId.startsWith("metadata_child:")) continue;
            const match = findInquiryChildInOpportunityRecord(record, { customerMemberId: cmId });
            const resolved = trimId(match?.person_id);
            if (resolved) ids.add(resolved);
        }
    }

    return [...ids];
}
