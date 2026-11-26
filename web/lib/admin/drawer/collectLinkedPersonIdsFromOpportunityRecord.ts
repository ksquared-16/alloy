import { findInquiryChildInOpportunityRecord } from "@/lib/admin/drawer/inquiryChildOpportunityRows";
import { primaryPersonIdFromOpportunityRecord } from "@/lib/admin/drawer/linkedRecordFieldEditing";

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/**
 * The ADULT contacts linked on an opportunity record, with the names the payload already
 * resolved — `_opportunity_persons` (case contacts) and `_customer_persons` (household
 * members), primary first.
 *
 * Deliberately NOT the same set as {@link collectLinkedPersonIdsFromOpportunityRecord}: that
 * one includes inquiry children because it warms their records. A child is not a candidate
 * for an employment relationship, and including them would put every child of every family
 * through an employment applicability test forever.
 */
export function collectLinkedContactsFromOpportunityRecord(
    record: Record<string, unknown>
): Array<{ id: string; label: string | null }> {
    const byId = new Map<string, string | null>();

    const take = (rows: unknown) => {
        if (!Array.isArray(rows)) return;
        for (const row of rows) {
            if (!row || typeof row !== "object") continue;
            const raw = row as Record<string, unknown>;
            const personId = trimId(raw.person_id);
            if (!personId) continue;
            const name = trimId(raw.name);
            // First writer wins for the id; a later row may still supply a missing name.
            if (!byId.has(personId)) byId.set(personId, name);
            else if (byId.get(personId) == null && name) byId.set(personId, name);
        }
    };

    take(record._opportunity_persons);
    take(record._customer_persons);

    const primary = primaryPersonIdFromOpportunityRecord(record);
    if (primary && !byId.has(primary)) {
        const identity = record._identity as { primary_person?: { label?: unknown } } | null | undefined;
        byId.set(primary, trimId(identity?.primary_person?.label));
    }

    const entries = [...byId.entries()].map(([id, label]) => ({ id, label }));
    if (!primary) return entries;
    return entries.sort((a, b) => (a.id === primary ? -1 : b.id === primary ? 1 : 0));
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
