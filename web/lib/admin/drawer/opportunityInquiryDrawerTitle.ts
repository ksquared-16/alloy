function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const s = String(value).trim();
    return s.length > 0 ? s : null;
}

/** Strip trailing "household" wording from display labels used in drawer titles. */
export function stripHouseholdWording(label: string): string {
    return label
        .replace(/\s*[-–—]\s*household\s*$/i, "")
        .replace(/\s+household\s*$/i, "")
        .replace(/\bhousehold\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .replace(/^\s*[-:]\s*/g, "")
        .trim();
}

/**
 * Opportunity inquiry drawer title — `{configured label} — {household name}`.
 * Uses household/customer identity only (never primary contact person name).
 */
export function formatOpportunityInquiryDrawerTitle(
    data: Record<string, unknown>,
    opportunitySingular: string
): string {
    const ident = (data._identity as Record<string, unknown> | null) ?? null;
    const householdLabel =
        ident?.household && typeof ident.household === "object"
            ? trimOrNull((ident.household as { label?: unknown }).label)
            : null;
    const customerName = trimOrNull((data as { _customer_name?: unknown })._customer_name);
    const inquiryTitle =
        ident?.inquiry && typeof ident.inquiry === "object"
            ? trimOrNull((ident.inquiry as { title?: unknown }).title)
            : null;
    const recordName = trimOrNull(data.name) ?? trimOrNull(data.title);

    const householdName =
        stripHouseholdWording(householdLabel ?? "") ||
        stripHouseholdWording(customerName ?? "") ||
        stripHouseholdWording(inquiryTitle ?? "") ||
        stripHouseholdWording(recordName ?? "");

    const entityLabel = trimOrNull(opportunitySingular) || "Lead";
    if (!householdName) return entityLabel;
    if (householdName.toLowerCase() === entityLabel.toLowerCase()) return entityLabel;
    return `${entityLabel} — ${householdName}`;
}
