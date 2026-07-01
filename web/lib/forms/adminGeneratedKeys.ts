/**
 * Deterministic keys for admin-created forms/packets (display name → snake_case).
 * Collisions resolved with numeric suffixes `_2`, `_3`, …
 */

const MAX_LEN = 62;

/** Lowercase snake_case from a human title (Alloy Forms admin UX). */
export function slugKeyFromDisplayName(raw: string): string {
    const s = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    const slug = s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
    const base = slug.length > 0 ? slug : "form";
    if (/^[a-z]/.test(base)) return base.slice(0, MAX_LEN);
    return `f_${base}`.replace(/_+/g, "_").slice(0, MAX_LEN);
}

/** Pick `base`, or `base_2`, `base_3`, … first not in `taken`. */
export function allocateUniqueKey(base: string, taken: ReadonlySet<string>): string {
    const b = base.slice(0, MAX_LEN);
    if (!taken.has(b)) return b;
    for (let i = 2; i < 10_000; i++) {
        const suffix = `_${i}`;
        const head = b.slice(0, Math.max(1, MAX_LEN - suffix.length));
        const candidate = `${head}${suffix}`;
        if (!taken.has(candidate)) return candidate;
    }
    return `${b}_${Date.now()}`.slice(0, MAX_LEN);
}
