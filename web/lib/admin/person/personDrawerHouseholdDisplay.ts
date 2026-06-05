/** Display helpers for shared household person rows. */

/** PostgREST `persons` row shape for household child meta — only native columns. */
export type PersonDrawerChildMetaRow = {
    date_of_birth?: string | null;
    metadata?: Record<string, unknown> | null;
};

/**
 * Resolve child DOB for drawer household links.
 * `public.persons` has `date_of_birth` only (no `dob` column). Optional metadata fallbacks never throw.
 */
export function resolvePersonDrawerChildDateOfBirth(
    row: PersonDrawerChildMetaRow | null | undefined
): string | null {
    if (!row || typeof row !== "object") return null;
    const native = String(row.date_of_birth ?? "").trim();
    if (native) return native.slice(0, 10);
    const md = row.metadata;
    if (!md || typeof md !== "object" || Array.isArray(md)) return null;
    for (const key of ["date_of_birth", "dob", "dateOfBirth"] as const) {
        const v = String((md as Record<string, unknown>)[key] ?? "").trim();
        if (v) return v.slice(0, 10);
    }
    return null;
}

export function personDrawerHouseholdInitials(displayName: string): string {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
    }
    return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

export function personDrawerHouseholdAgeLabel(
    dateOfBirth: string | null | undefined,
    ageFromRecord?: string | null
): string | null {
    const fromRecord = String(ageFromRecord ?? "").trim();
    if (fromRecord) return fromRecord;
    const raw = String(dateOfBirth ?? "").trim();
    if (!raw) return null;
    const iso = raw.slice(0, 10);
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - d.getFullYear();
    let months = now.getMonth() - d.getMonth();
    if (now.getDate() - d.getDate() < 0) months -= 1;
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    if (years < 0) return null;
    if (years >= 2) return `${years} yrs`;
    if (years >= 1) return `${years} yr ${months} mo`;
    return `${Math.max(0, years * 12 + months)} mo`;
}
