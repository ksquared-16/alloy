/**
 * Canonical email normalization (Decision C).
 * trim + lowercase; empty → null. Email is a strong signal, not a unique identity key.
 */

export function normalizeEmail(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const s = String(value).trim().toLowerCase();
    return s === "" ? null : s;
}
