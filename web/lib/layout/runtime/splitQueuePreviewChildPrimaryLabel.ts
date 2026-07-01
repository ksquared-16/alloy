/** Split CRM queue preview child primary lines like "Alex Kelly (6m)" into name + inline age. */
const CHILD_PRIMARY_AGE_SUFFIX_RE = /^(.+?)\s*\(([^)]+)\)\s*$/;

export function splitQueuePreviewChildPrimaryLabel(raw: string): { name: string; inlineAge: string | null } {
    const trimmed = raw.trim();
    if (!trimmed) return { name: "", inlineAge: null };
    const match = trimmed.match(CHILD_PRIMARY_AGE_SUFFIX_RE);
    if (!match) return { name: trimmed, inlineAge: null };
    const name = match[1]!.trim();
    const inlineAge = match[2]!.trim();
    if (!name) return { name: trimmed, inlineAge: null };
    return { name, inlineAge };
}

/** Display-only cleanup when age is not a configured queue column field. */
export function stripParentheticalAgeFromChildDisplayName(raw: string): string {
    return splitQueuePreviewChildPrimaryLabel(raw).name || raw;
}
