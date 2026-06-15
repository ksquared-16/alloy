function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const s = String(value).trim();
    return s.length > 0 ? s : null;
}

/** True when a label already uses household-oriented lead naming (`… Family` / `… Lead`). */
export function isHouseholdFormattedLeadName(name: string): boolean {
    return /\s(Family|Lead)$/i.test(name.trim());
}

/**
 * Household-oriented display name for new leads — prefer `{LastName} Family`, else `{FirstName} Lead`.
 */
export function buildHouseholdLeadDisplayName(args: {
    firstName?: string | null;
    lastName?: string | null;
    fallback?: string | null;
}): string {
    const lastName = trimOrNull(args.lastName);
    const firstName = trimOrNull(args.firstName);
    if (lastName) return `${lastName} Family`;
    if (firstName) return `${firstName} Lead`;
    return trimOrNull(args.fallback) ?? "New lead";
}

/**
 * Drawer/queue title from a household base name (stripped of legacy "Household" suffix).
 * Returns `{Base} Family` unless the base is already household-formatted.
 */
export function formatHouseholdLeadDisplayTitle(
    householdBase: string,
    entityLabel = "Lead",
): string {
    const base = trimOrNull(householdBase);
    if (!base) return entityLabel;
    if (isHouseholdFormattedLeadName(base)) return base;
    if (base.toLowerCase() === entityLabel.toLowerCase()) return entityLabel;
    return `${base} Family`;
}
