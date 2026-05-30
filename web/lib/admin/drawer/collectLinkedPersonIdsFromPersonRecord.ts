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

    const childLinks = record._household_child_links;
    if (Array.isArray(childLinks)) {
        for (const row of childLinks) {
            if (!row || typeof row !== "object") continue;
            add(trimId((row as { person_id?: unknown }).person_id));
        }
    }

    const adultLinks = record._household_adult_links;
    if (Array.isArray(adultLinks)) {
        for (const row of adultLinks) {
            if (!row || typeof row !== "object") continue;
            add(trimId((row as { person_id?: unknown }).person_id));
        }
    }

    const siblingLinks = record._sibling_links;
    if (Array.isArray(siblingLinks)) {
        for (const row of siblingLinks) {
            if (!row || typeof row !== "object") continue;
            add(trimId((row as { person_id?: unknown }).person_id));
        }
    }

    const relationships = record._person_relationships;
    if (Array.isArray(relationships)) {
        for (const row of relationships) {
            if (!row || typeof row !== "object") continue;
            add(trimId((row as { person_id?: unknown }).person_id));
        }
    }

    return [...ids];
}
