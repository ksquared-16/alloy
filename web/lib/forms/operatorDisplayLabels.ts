/** Turn internal keys/slugs into operator-facing labels (never show raw keys in primary UI). */
export function humanizeOperatorSlug(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
