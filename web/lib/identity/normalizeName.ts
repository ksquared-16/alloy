/**
 * Canonical name normalization (Decision C).
 * trim + lowercase + collapse runs of whitespace to a single space; empty → null.
 */

export function normalizeName(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") return null;
    const s = value.trim().toLowerCase().replace(/\s+/g, " ");
    return s === "" ? null : s;
}
