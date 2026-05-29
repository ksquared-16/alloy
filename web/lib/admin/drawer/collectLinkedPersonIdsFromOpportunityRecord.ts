import { primaryPersonIdFromOpportunityRecord } from "@/lib/admin/drawer/linkedRecordFieldEditing";

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/** Person entity ids linked on an opportunity drawer record (primary + `_opportunity_persons`). */
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

    return [...ids];
}
