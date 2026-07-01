/** Shared emptiness check for completion guardrails. */
export function completionValueEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (typeof value === "boolean") return false;
    if (typeof value === "number") return Number.isNaN(value);
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

export function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}
