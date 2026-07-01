/**
 * Resolve a field_definition row from list metadata (id + keys for matching).
 */

export type FieldDefListItem = {
    id: string;
    field_key?: string | null;
    label?: string | null;
};

export type ResolveFieldResult =
    | { ok: true; match: FieldDefListItem }
    | { ok: false; error: string; candidates?: FieldDefListItem[] };

function norm(s: string): string {
    return s.trim().toLowerCase();
}

/**
 * Match by field_key exact, label exact, then substring on label, then field_key.
 */
export function resolveFieldDefinitionByQuery(items: FieldDefListItem[], query: string): ResolveFieldResult {
    const q = norm(query);
    if (!q) {
        return { ok: false, error: "Empty field query." };
    }
    if (!items.length) {
        return { ok: false, error: "No field definitions loaded for this entity type." };
    }

    const keyExact = items.find((x) => norm(x.field_key ?? "") === q);
    if (keyExact) return { ok: true, match: keyExact };

    const labelExact = items.filter((x) => norm(x.label ?? "") === q);
    if (labelExact.length === 1) return { ok: true, match: labelExact[0]! };
    if (labelExact.length > 1) {
        return { ok: false, error: `Ambiguous label “${query}”: multiple fields match.`, candidates: labelExact };
    }

    const labelSub = items.filter((x) => norm(x.label ?? "").includes(q));
    if (labelSub.length === 1) return { ok: true, match: labelSub[0]! };
    if (labelSub.length > 1) {
        return {
            ok: false,
            error: `Ambiguous: multiple labels contain “${query}”. Pick a field_key or narrower label.`,
            candidates: labelSub.slice(0, 8),
        };
    }

    const keySub = items.filter((x) => norm(x.field_key ?? "").includes(q));
    if (keySub.length === 1) return { ok: true, match: keySub[0]! };
    if (keySub.length > 1) {
        return { ok: false, error: `Ambiguous field_key match for “${query}”.`, candidates: keySub.slice(0, 8) };
    }

    return { ok: false, error: `No field matching “${query}” in this entity type.` };
}
