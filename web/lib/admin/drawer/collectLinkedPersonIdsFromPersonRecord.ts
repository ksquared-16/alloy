function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/** Person ids linked on a hydrated person drawer (household adults, children, siblings). */
export function collectLinkedPersonIdsFromPersonRecord(record: Record<string, unknown>): string[] {
    const viewingId = trimId(record.id);
    const ids = new Set<string>();

    const add = (personId: string | null) => {
        if (!personId || personId === viewingId) return;
        ids.add(personId);
    };

    for (const row of record._household_child_links as { person_id?: unknown }[] | undefined) {
        if (!row || typeof row !== "object") continue;
        add(trimId(row.person_id));
    }

    for (const row of record._household_adult_links as { person_id?: unknown }[] | undefined) {
        if (!row || typeof row !== "object") continue;
        add(trimId(row.person_id));
    }

    for (const row of record._sibling_links as { person_id?: unknown }[] | undefined) {
        if (!row || typeof row !== "object") continue;
        add(trimId(row.person_id));
    }

    for (const row of record._person_relationships as { person_id?: unknown }[] | undefined) {
        if (!row || typeof row !== "object") continue;
        add(trimId(row.person_id));
    }

    return [...ids];
}
