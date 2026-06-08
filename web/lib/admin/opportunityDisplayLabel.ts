/**
 * Operator-facing opportunity labels — strip legacy "Family inquiry" boilerplate
 * and prefer household/location tails from stored opportunity names.
 */

const BOILERPLATE_EXACT = new Set(["inquiry", "family inquiry", "opportunity"]);

/** True when label is generic inquiry template text (never show verbatim). */
export function isGenericOpportunityBoilerplateLabel(label: string | null | undefined): boolean {
    const raw = String(label ?? "").trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (BOILERPLATE_EXACT.has(lower)) return true;
    return /^family\s+inquir/i.test(raw);
}

function stripBoilerplatePrefix(label: string): string {
    return label
        .replace(/^family\s+inquiry\s*[-–—:|]\s*/i, "")
        .replace(/^inquiry\s*[-–—:|]\s*/i, "")
        .trim();
}

function meaningfulSegments(label: string): string[] {
    return label
        .split(/\s[-–—/|·]\s/)
        .map((s) => s.trim())
        .filter((s) => s && !isGenericOpportunityBoilerplateLabel(s));
}

export type FormatOpportunityOperatorDisplayLabelOpts = {
    /** Configured singular entity label (e.g. Lead). Used only when no better household/location tail exists. */
    entitySingularLabel?: string | null;
    locationName?: string | null;
    customerName?: string | null;
};

/**
 * Primary label for search pickers, task assist, and queue-adjacent surfaces.
 * Prefers "Chen / West Campus" over "Family inquiry — Chen / West Campus".
 */
export function formatOpportunityOperatorDisplayLabel(
    raw: string | null | undefined,
    opts?: FormatOpportunityOperatorDisplayLabelOpts
): string {
    const trimmed = String(raw ?? "").trim();
    const entity = opts?.entitySingularLabel?.trim() || "Lead";
    const location = opts?.locationName?.trim() || null;
    const customer = opts?.customerName?.trim() || null;

    if (trimmed && !isGenericOpportunityBoilerplateLabel(trimmed)) {
        const stripped = stripBoilerplatePrefix(trimmed);
        if (stripped && !isGenericOpportunityBoilerplateLabel(stripped)) return stripped;
    }

    const segments = trimmed ? meaningfulSegments(trimmed) : [];
    if (segments.length) return segments.join(" / ");

    if (customer && location) return `${customer} / ${location}`;
    if (location) return location;
    if (customer) return customer;

    return entity;
}
